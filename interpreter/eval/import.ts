import type { DirectiveNode, TextNode, MlldVariable, ContentNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, evaluate } from '../core/interpreter';
import { parse } from '@grammar/parser';
import * as path from 'path';
import { VariableRedefinitionError } from '@core/errors';

type ContentNodeArray = ContentNode[];

/**
 * Import from a resolved path (extracted to handle both normal paths and URL strings)
 */
async function importFromPath(
  directive: DirectiveNode,
  resolvedPath: string,
  env: Environment
): Promise<EvalResult> {
  const isURL = env.isURL(resolvedPath);
  
  
  // Check for circular imports
  if (env.isImporting(resolvedPath)) {
    throw new Error(`Circular import detected: ${resolvedPath}`);
  }
  
  try {
    // Mark that we're importing this path
    if (isURL) {
      env.beginImport(resolvedPath);
    }
    
    // Read the file or fetch the URL
    // For URL imports, use the special import flag to trigger approval
    const content = isURL
      ? await env.fetchURL(resolvedPath, true) // true = forImport
      : await env.readFile(resolvedPath);
    
    // Handle section extraction if specified
    let processedContent = content;
    const section = directive.raw?.section;
    if (section) {
      processedContent = extractSection(content, section);
    }
    
    // Parse the imported content
    const parseResult = await parse(processedContent);
    const ast = parseResult.ast;
    
    // Create a child environment for the imported file
    // For URLs, use the current directory as basePath since URLs don't have directories
    const importDir = isURL ? env.getBasePath() : path.dirname(resolvedPath);
    const childEnv = env.createChild(importDir);
    
    // Set the current file path for the imported file (for error reporting)
    childEnv.setCurrentFilePath(resolvedPath);
    
    // Evaluate the imported file
    const result = await evaluate(ast, childEnv);
    
    // Get variables from child environment
    const childVars = childEnv.getCurrentVariables();
    
    // Handle variable merging based on import type
    if (directive.subtype === 'importAll') {
      // Import all variables from child to parent
      for (const [name, variable] of childVars) {
        // Mark variable as imported
        const importedVariable = {
          ...variable,
          metadata: {
            ...variable.metadata,
            isImported: true,
            importPath: resolvedPath
          }
        };
        env.setVariable(name, importedVariable);
      }
      
    } else if (directive.subtype === 'importNamespace') {
      // Import all variables under a namespace alias
      const imports = directive.values?.imports || [];
      const importNode = imports[0]; // Should be single wildcard with alias
      const alias = importNode?.alias;
      
      if (!alias) {
        throw new Error('Namespace import missing alias');
      }
      
      // Create namespace object containing all variables
      const namespaceObject: Record<string, any> = {};
      for (const [name, variable] of childVars) {
        namespaceObject[name] = variable.value;
      }
      
      // Create namespace variable
      const namespaceVariable = {
        type: 'data' as const,
        value: namespaceObject,
        nodeId: '',
        location: { line: 0, column: 0 },
        metadata: {
          isImported: true,
          importPath: resolvedPath,
          isNamespace: true
        }
      };
      
      env.setVariable(alias, namespaceVariable);
      
    } else if (directive.subtype === 'importSelected') {
      // Get selected variables from AST
      const imports = directive.values?.imports || [];
      for (const importNode of imports) {
        const varName = importNode.identifier;
        const variable = childVars.get(varName);
        if (variable) {
          // Use alias if provided, otherwise use original name
          const targetName = importNode.alias || varName;
          // Mark variable as imported
          const importedVariable = {
            ...variable,
            metadata: {
              ...variable.metadata,
              isImported: true,
              importPath: resolvedPath
            }
          };
          env.setVariable(targetName, importedVariable);
        } else {
          // Variable not found in imported file
          throw new Error(`Variable '${varName}' not found in imported file: ${resolvedPath}`);
        }
      }
    }
    
    return { value: undefined, env };
  } finally {
    // Always mark import as complete
    if (isURL) {
      env.endImport(resolvedPath);
    }
  }
}

/**
 * Evaluate @import directives.
 * Processes other Mlld files recursively with proper scoping.
 * 
 * Ported from ImportDirectiveHandler.
 */
export async function evaluateImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Get the path to import
  const pathValue = directive.values?.path;
  if (!pathValue) {
    throw new Error('Import directive missing path');
  }
  
  // Handle both string paths (legacy) and node arrays (new)
  let pathNodes: ContentNodeArray;
  
  if (typeof pathValue === 'string') {
    // Legacy string path handling - convert to node array
    pathNodes = [{ type: 'Text', content: pathValue, nodeId: '', location: directive.location }];
  } else if (Array.isArray(pathValue)) {
    // Normal case: pathValue is already an array of nodes
    pathNodes = pathValue;
  } else {
    throw new Error('Import directive path must be a string or array of nodes');
  }
  
  // Check for special stdin import (@stdin, @INPUT, or @input)
  if (pathNodes.length === 1 && pathNodes[0].type === 'Text') {
    const content = pathNodes[0].content;
    if (content === '@INPUT' || content === '@input') {
      return await evaluateInputImport(directive, env);
    } else if (content === '@stdin') {
      // Show deprecation warning for @stdin
      console.warn('⚠️  Warning: @stdin is deprecated. Please use @INPUT or @input instead.');
      return await evaluateInputImport(directive, env);
    }
  }
  
  // Check if this is a URL path based on the path node structure
  const pathNode = pathNodes[0]; // Assuming single path node for imports
  const isURL = pathNode?.subtype === 'urlPath' || pathNode?.subtype === 'urlSectionPath';
  
  // Resolve the import path (handles both file paths and URLs)
  const importPath = await interpolate(pathNodes, env);
  let resolvedPath: string;
  
  // Check if this is a module reference (@prefix/ pattern)
  if (importPath.startsWith('@')) {
    // Use the ResolverManager for @prefix/ patterns
    const resolverManager = env.getResolverManager();
    if (resolverManager) {
      try {
        // ResolverManager will handle all @prefix/ patterns including @user/module
        const content = await env.resolveModule(importPath);
        
        // For module imports, we need to write the content to a temporary location
        // or handle it directly. For now, let's process it directly.
        // Create a unique identifier for this module import
        const moduleId = `module:${importPath}`;
        
        // Mark that we're importing this module
        env.beginImport(moduleId);
        
        try {
          // Parse the module content
          const parseResult = await parse(content);
          const ast = parseResult.ast;
          
          // Create a child environment for the module
          const childEnv = env.createChild(env.getBasePath());
          childEnv.setCurrentFilePath(moduleId);
          
          // Evaluate the module
          const result = await evaluate(ast, childEnv);
          
          // Handle variable merging (same as file imports)
          const childVars = childEnv.getCurrentVariables();
          
          if (directive.subtype === 'importAll') {
            for (const [name, variable] of childVars) {
              const importedVariable = {
                ...variable,
                metadata: {
                  ...variable.metadata,
                  isImported: true,
                  importPath: moduleId
                }
              };
              env.setVariable(name, importedVariable);
            }
          } else if (directive.subtype === 'importNamespace') {
            const imports = directive.values?.imports || [];
            const importNode = imports[0];
            const alias = importNode?.alias;
            
            if (!alias) {
              throw new Error('Namespace import missing alias');
            }
            
            const namespaceObject: Record<string, any> = {};
            for (const [name, variable] of childVars) {
              namespaceObject[name] = variable.value;
            }
            
            const namespaceVariable = {
              type: 'data' as const,
              value: namespaceObject,
              nodeId: '',
              location: { line: 0, column: 0 },
              metadata: {
                isImported: true,
                importPath: moduleId
              }
            };
            env.setVariable(alias, namespaceVariable);
          } else if (directive.subtype === 'importSelected') {
            const imports = directive.values?.imports || [];
            for (const importNode of imports) {
              const sourceName = importNode.identifier || importNode.name;
              const targetName = importNode.alias || sourceName;
              
              const variable = childVars.get(sourceName);
              if (!variable) {
                throw new Error(`Variable '${sourceName}' not found in module: ${importPath}`);
              }
              
              const importedVariable = {
                ...variable,
                metadata: {
                  ...variable.metadata,
                  isImported: true,
                  importPath: moduleId
                }
              };
              env.setVariable(targetName, importedVariable);
            }
          }
          
          return { value: result.value, shouldOutput: false };
        } finally {
          env.endImport(moduleId);
        }
      } catch (error) {
        // If resolver fails, fall back to legacy behavior
        console.warn(`ResolverManager failed for ${importPath}, falling back to legacy:`, error);
        resolvedPath = importPath;
      }
    } else {
      // No ResolverManager available, use legacy mlld:// handling
      if (importPath.startsWith('mlld://')) {
        // For legacy mlld:// URLs, just use them as-is
        // The actual resolution will happen when fetching
        resolvedPath = importPath;
      } else {
        resolvedPath = importPath;
      }
    }
  } else if (isURL || env.isURL(importPath)) {
    // For URLs, use the URL as-is (no path resolution needed)
    resolvedPath = importPath;
  } else {
    // For file paths, resolve relative to current basePath
    resolvedPath = await env.resolvePath(importPath);
  }
  
  // Use the common import logic
  return importFromPath(directive, resolvedPath, env);
}

/**
 * Extract a section from markdown content.
 * Copied from add.ts - should probably be in a shared utility.
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      continue;
    }
    
    if (inSection) {
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\\n').trim();
}

/**
 * Evaluate input import.
 * Handles importing data from @INPUT/@input with JSON auto-detection.
 */
async function evaluateInputImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Get input content from INPUT reserved variable
  const inputVar = env.getVariable('INPUT');
  if (!inputVar || !inputVar.value) {
    throw new Error('No input data available. @INPUT requires data to be provided via stdin or --stdin flag.');
  }
  
  const inputContent = String(inputVar.value);
  
  // Try to parse as JSON first
  let variables: Map<string, MlldVariable> = new Map();
  
  try {
    const jsonData = JSON.parse(inputContent);
    
    // Convert JSON to variables
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // JSON object - extract fields as variables
      for (const [key, value] of Object.entries(jsonData)) {
        variables.set(key, {
          type: 'data',
          value: value,
          nodeId: '',
          location: { line: 0, column: 0 },
          metadata: {
            isImported: true,
            importPath: '@INPUT',
            definedAt: { line: 0, column: 0, filePath: '@INPUT' }
          }
        });
      }
    } else {
      // Non-object JSON (array, string, number, etc.) - store as 'content'
      variables.set('content', {
        type: 'data',
        value: jsonData,
        nodeId: '',
        location: { line: 0, column: 0 },
        metadata: {
          isImported: true,
          importPath: '@INPUT',
          definedAt: { line: 0, column: 0, filePath: '@INPUT' }
        }
      });
    }
  } catch {
    // Not valid JSON - store as plain text in 'content' variable
    variables.set('content', {
      type: 'text',
      value: inputContent,
      nodeId: '',
      location: { line: 0, column: 0 },
      metadata: {
        isImported: true,
        importPath: '@INPUT',
        definedAt: { line: 0, column: 0, filePath: '@INPUT' }
      }
    });
  }
  
  // Handle variable merging based on import type
  if (directive.subtype === 'importAll') {
    // Import all variables
    for (const [name, variable] of variables) {
      env.setVariable(name, variable);
    }
  } else if (directive.subtype === 'importSelected') {
    // Import selected variables
    const imports = directive.values?.imports || [];
    for (const importNode of imports) {
      const varName = importNode.identifier;
      const variable = variables.get(varName);
      if (variable) {
        // Use alias if provided, otherwise use original name
        const targetName = importNode.alias || varName;
        env.setVariable(targetName, variable);
      } else {
        // Variable not found in stdin data
        throw new Error(`Variable '${varName}' not found in input data`);
      }
    }
  }
  
  // Imports are definition directives - they don't produce output
  return { value: undefined, env };
}