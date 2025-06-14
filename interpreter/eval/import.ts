import type { DirectiveNode, TextNode, MlldVariable, ContentNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, evaluate } from '../core/interpreter';
import { parse } from '@grammar/parser';
import * as path from 'path';
import { VariableRedefinitionError, MlldError } from '@core/errors';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { checkMlldVersion, formatVersionError } from '@core/utils/version-checker';
import { version as currentMlldVersion } from '@core/version';

type ContentNodeArray = ContentNode[];

/**
 * Process module exports - either use explicit @data module or auto-generate
 */
function processModuleExports(
  childVars: Map<string, MlldVariable>,
  parseResult: any
): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null } {
  // Extract frontmatter if present
  const frontmatter = parseResult.frontmatter || null;
  
  // Always start with auto-export of all top-level variables
  const moduleObject: Record<string, any> = {};
  
  // First, add all top-level variables with type preservation
  for (const [name, variable] of childVars) {
    // Skip the 'module' variable itself
    if (name !== 'module') {
      // Preserve variable type information for proper import
      moduleObject[name] = {
        __variableType: variable.type,
        __value: variable.value
      };
      
      // For executable variables, preserve the ExecutableDefinition structure
      if (variable.type === 'executable') {
        const execVar = variable as any;
        moduleObject[name].__definition = execVar.definition;
        moduleObject[name].__params = execVar.params;
        moduleObject[name].__content = execVar.content;
      }
      // For legacy textTemplate variables, preserve additional metadata
      else if (variable.type === 'textTemplate') {
        moduleObject[name].__params = (variable as any).params;
        moduleObject[name].__content = (variable as any).content;
      }
    }
  }
  
  // Then, if there's an explicit module export, add it as a structured export
  const moduleVar = childVars.get('module');
  if (moduleVar && moduleVar.type === 'data') {
    // Handle DataObject type that might have type/properties structure
    let moduleValue = moduleVar.value;
    if (moduleValue && typeof moduleValue === 'object' && 
        moduleValue.type === 'object' && moduleValue.properties) {
      moduleValue = moduleValue.properties;
    }
    
    // Add the module structured export (this enables @module.something access)
    moduleObject.module = {
      __variableType: 'data',
      __value: moduleValue
    };
  }
  
  return {
    moduleObject,
    frontmatter
  };
}

/**
 * Import from a resolved path (extracted to handle both normal paths and URL strings)
 */
async function importFromPath(
  directive: DirectiveNode,
  resolvedPath: string,
  env: Environment,
  expectedHash?: string
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
    let content: string;
    try {
      content = isURL
        ? await env.fetchURL(resolvedPath, true) // true = forImport
        : await env.readFile(resolvedPath);
    } catch (error) {
      throw new Error(`Failed to read imported file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Validate hash if expected
    if (expectedHash) {
      // Skip hash validation in test mode for modules-hash fixture
      const isTestMode = process.env.MLLD_SKIP_HASH_VALIDATION === 'true';
      
      if (!isTestMode) {
        const actualHash = HashUtils.hash(content);
        const shortActualHash = HashUtils.shortHash(actualHash, expectedHash.length);
        
        // Compare with the expected hash (supporting short hashes)
        if (expectedHash.length < 64) {
          // Short hash comparison
          if (shortActualHash !== expectedHash) {
            throw new Error(
              `Module hash mismatch for '${resolvedPath}': ` +
              `expected ${expectedHash}, got ${shortActualHash} (full: ${actualHash})`
            );
          }
        } else {
          // Full hash comparison
          if (!HashUtils.secureCompare(actualHash, expectedHash)) {
            throw new Error(
              `Module hash mismatch for '${resolvedPath}': ` +
              `expected ${expectedHash}, got ${actualHash}`
            );
          }
        }
      }
    }
    
    // Check if this is a JSON file
    const isJsonFile = resolvedPath.endsWith('.json');
    
    // Special handling for JSON files
    if (isJsonFile) {
      try {
        const jsonData = JSON.parse(content);
        let moduleObject: Record<string, any> = {};
        
        // Convert JSON properties to module exports
        if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
          moduleObject = jsonData;
        } else {
          // Non-object JSON (array, string, number, etc.) - store as 'content'
          moduleObject = { content: jsonData };
        }
        
        // Handle variable merging based on import type
        if (directive.subtype === 'importAll') {
          // Import all properties
          for (const [name, value] of Object.entries(moduleObject)) {
            env.setVariable(name, {
              type: 'data',
              identifier: name,
              value: value,
              nodeId: '',
              location: { line: 0, column: 0 },
              metadata: {
                isImported: true,
                importPath: resolvedPath,
                definedAt: { line: 0, column: 0, filePath: resolvedPath }
              }
            });
          }
        } else if (directive.subtype === 'importSelected') {
          // Import selected properties
          const imports = directive.values?.imports || [];
          for (const importNode of imports) {
            const varName = importNode.identifier;
            if (varName in moduleObject) {
              const targetName = importNode.alias || varName;
              env.setVariable(targetName, {
                type: 'data',
                identifier: targetName,
                value: moduleObject[varName],
                nodeId: '',
                location: { line: 0, column: 0 },
                metadata: {
                  isImported: true,
                  importPath: resolvedPath,
                  definedAt: { line: 0, column: 0, filePath: resolvedPath }
                }
              });
            } else {
              const availableExports = Object.keys(moduleObject);
              throw new Error(
                `Variable '${varName}' not found in module exports from ${resolvedPath}. ` +
                `Available exports: ${availableExports.join(', ')}`
              );
            }
          }
        }
        
        return { value: undefined, env };
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`Invalid JSON in file '${resolvedPath}': ${error.message}`);
        }
        throw error;
      }
    }
    
    // Handle section extraction if specified
    let processedContent = content;
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env);
      if (section) {
        processedContent = extractSection(content, section);
      }
    }
    
    // Parse the imported content
    const parseResult = await parse(processedContent);
    
    // Check if parsing succeeded
    if (!parseResult.success) {
      const parseError = parseResult.error;
      
      // Create an error that preserves the import context
      const errorMessage = parseError && 'location' in parseError
        ? `Syntax error in imported file '${resolvedPath}' at line ${parseError.location?.start?.line || '?'}: ${parseError.message || 'Unknown parse error'}`
        : `Failed to parse imported file '${resolvedPath}': ${parseError?.message || 'Unknown parse error'}`;
      
      const importError = new Error(errorMessage);
      
      // Add parse error details to the error for trace enhancement
      (importError as any).importParseError = {
        file: path.basename(resolvedPath, '.mld'),
        line: parseError?.location?.start?.line || '?',
        message: parseError?.message || 'Unknown parse error'
      };
      
      // Preserve the current trace context - the import directive is already on the stack
      // The error will be caught by evaluateDirective and enhanced with the trace
      throw importError;
    }
    
    const ast = parseResult.ast;
    
    // Check for frontmatter in the AST and check version compatibility
    let frontmatterData: Record<string, any> | null = null;
    if (ast.length > 0 && ast[0].type === 'Frontmatter') {
      const { parseFrontmatter } = await import('../utils/frontmatter-parser');
      const frontmatterNode = ast[0] as any;
      frontmatterData = parseFrontmatter(frontmatterNode.content);
      
      // Check mlld version compatibility
      const requiredVersion = frontmatterData['mlld-version'] || 
                             frontmatterData['mlldVersion'] ||
                             frontmatterData['mlld_version'];
      
      if (requiredVersion) {
        if (process.env.MLLD_DEBUG_VERSION) {
          console.log(`[Version Check] Module requires: ${requiredVersion}, Current: ${currentMlldVersion}`);
        }
        const versionCheck = checkMlldVersion(requiredVersion);
        if (!versionCheck.compatible) {
          const moduleName = frontmatterData.module || 
                           frontmatterData.name || 
                           path.basename(resolvedPath);
          
          throw new MlldError(
            formatVersionError(moduleName, requiredVersion, currentMlldVersion),
            { 
              code: 'VERSION_MISMATCH', 
              severity: 'error',
              module: moduleName,
              requiredVersion,
              path: resolvedPath
            }
          );
        }
      }
    }
    
    // Create a child environment for the imported file
    // For URLs, use the current directory as basePath since URLs don't have directories
    const importDir = isURL ? env.getBasePath() : path.dirname(resolvedPath);
    const childEnv = env.createChild(importDir);
    
    // Set the current file path for the imported file (for error reporting)
    childEnv.setCurrentFilePath(resolvedPath);
    
    // Evaluate the imported file
    let result: EvalResult;
    try {
      result = await evaluate(ast, childEnv);
    } catch (error) {
      throw new Error(
        `Error evaluating imported file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    // Get variables from child environment
    const childVars = childEnv.getCurrentVariables();
    
    // Process module exports (explicit or auto-generated)
    const { moduleObject, frontmatter } = processModuleExports(childVars, { frontmatter: frontmatterData });
    
    // Add __meta__ property with frontmatter if available
    if (frontmatter) {
      moduleObject.__meta__ = frontmatter;
    }
    
    // Handle variable merging based on import type
    if (directive.subtype === 'importAll') {
      // For module imports, treat the module object as the source
      // Import all properties from the module object
      for (const [name, value] of Object.entries(moduleObject)) {
        // Skip __meta__ from being a direct import
        if (name === '__meta__') continue;
        
        // Create variable for each module export
        // Check if this is a variable with preserved type information
        let varType: 'text' | 'data' | 'path' | 'command' | 'import' | 'executable' = 'data';
        let varValue = value;
        
        if (value && typeof value === 'object' && '__variableType' in value && '__value' in value) {
          varType = value.__variableType;
          varValue = value.__value;
          
          // Handle backward compatibility: convert textTemplate to executable
          if (varType === 'textTemplate') {
            varType = 'executable';
          }
        }
        
        const importedVariable: MlldVariable = {
          type: varType,
          identifier: name,
          value: varValue,
          nodeId: '',
          location: { line: 0, column: 0 },
          metadata: {
            isImported: true,
            importPath: resolvedPath,
            definedAt: { line: 0, column: 0, filePath: resolvedPath }
          }
        };
        
        // For executable variables, restore the full structure
        if (varType === 'executable' && value && typeof value === 'object') {
          if ('__definition' in value) {
            (importedVariable as any).definition = value.__definition;
          } else {
            // Legacy textTemplate: create text type definition
            (importedVariable as any).definition = {
              type: 'text',
              params: value.__params || [],
              content: value.__content || []
            };
          }
          (importedVariable as any).params = value.__params || [];
          (importedVariable as any).content = value.__content || [];
        }
        // For legacy command variables, convert to executable
        else if (varType === 'command' && value && typeof value === 'object') {
          varType = 'executable';
          importedVariable.type = varType;
          (importedVariable as any).definition = {
            type: 'command',
            params: value.__params || [],
            command: value.__value || value.__command || []
          };
          (importedVariable as any).params = value.__params || [];
        }
        
        env.setVariable(name, importedVariable);
      }
      
    } else if (directive.subtype === 'importNamespace') {
      // Import entire module under a namespace alias
      const imports = directive.values?.imports || [];
      const importNode = imports[0]; // Should be single wildcard with alias
      const alias = importNode?.alias;
      
      if (!alias) {
        throw new Error('Namespace import missing alias');
      }
      
      // Create namespace variable with the module object
      const namespaceVariable: MlldVariable = {
        type: 'data',
        identifier: alias,
        value: moduleObject,
        nodeId: '',
        location: { line: 0, column: 0 },
        metadata: {
          isImported: true,
          importPath: resolvedPath,
          isNamespace: true,
          definedAt: { line: 0, column: 0, filePath: resolvedPath }
        }
      };
      
      env.setVariable(alias, namespaceVariable);
      
    } else if (directive.subtype === 'importSelected') {
      // Import selected variables from the module object
      const imports = directive.values?.imports || [];
      for (const importNode of imports) {
        const varName = importNode.identifier;
        
        // Check if the variable exists in the module object
        if (varName in moduleObject) {
          const value = moduleObject[varName];
          // Use alias if provided, otherwise use original name
          const targetName = importNode.alias || varName;
          
          // Create imported variable
          // Check if this is a variable with preserved type information
          let varType: 'text' | 'data' | 'path' | 'command' | 'import' | 'executable' = 'data';
          let varValue = value;
          
          if (value && typeof value === 'object' && '__variableType' in value && '__value' in value) {
            varType = value.__variableType;
            varValue = value.__value;
            
            // Handle backward compatibility: convert textTemplate to executable
            if (varType === 'textTemplate') {
              varType = 'executable';
            }
          }
          
          const importedVariable: MlldVariable = {
            type: varType,
            identifier: targetName,
            value: varValue,
            nodeId: '',
            location: { line: 0, column: 0 },
            metadata: {
              isImported: true,
              importPath: resolvedPath,
              definedAt: { line: 0, column: 0, filePath: resolvedPath }
            }
          };
          
          // For executable variables, restore the full structure
          if (varType === 'executable' && value && typeof value === 'object') {
            if ('__definition' in value) {
              (importedVariable as any).definition = value.__definition;
            } else {
              // Legacy textTemplate: create text type definition
              (importedVariable as any).definition = {
                type: 'text',
                params: value.__params || [],
                content: value.__content || []
              };
            }
            (importedVariable as any).params = value.__params || [];
            (importedVariable as any).content = value.__content || [];
          }
          // For legacy command variables, convert to executable
          else if (varType === 'command' && value && typeof value === 'object') {
            varType = 'executable';
            importedVariable.type = varType;
            (importedVariable as any).definition = {
              type: 'command',
              params: value.__params || [],
              command: value.__value || value.__command || []
            };
            (importedVariable as any).params = value.__params || [];
          }
          
          env.setVariable(targetName, importedVariable);
        } else {
          // Variable not found in module exports
          const availableExports = Object.keys(moduleObject).filter(k => k !== '__meta__');
          throw new Error(
            `Variable '${varName}' not found in module exports from ${resolvedPath}. ` +
            `Available exports: ${availableExports.join(', ')}`
          );
        }
      }
    }
    
    return { value: undefined, env };
  } catch (error) {
    // Re-throw with context about which import failed
    if (error instanceof Error && !error.message.includes(resolvedPath)) {
      throw new Error(`Import of '${resolvedPath}' failed: ${error.message}`);
    }
    throw error;
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
  // Handle cases where the path might have multiple nodes (e.g., VariableReference + newline Text)
  if (pathNodes.length >= 1) {
    const firstNode = pathNodes[0];
    if (firstNode.type === 'Text') {
      const content = firstNode.content;
      if (content === '@INPUT' || content === '@input') {
        return await evaluateInputImport(directive, env);
      } else if (content === '@stdin') {
        // Silently handle @stdin for backward compatibility
        return await evaluateInputImport(directive, env);
      }
    } else if (firstNode.type === 'VariableReference') {
      // Handle case where @INPUT is parsed as a VariableReference
      const varRef = firstNode as any;
      if (varRef.identifier === 'INPUT' || varRef.identifier === 'input') {
        return await evaluateInputImport(directive, env);
      } else if (varRef.identifier === 'stdin') {
        // Silently handle @stdin for backward compatibility
        return await evaluateInputImport(directive, env);
      }
    }
  }
  
  // Also check for resolver imports when path is a VariableReference with isSpecial flag
  // This handles cases like @import { iso, unix, date } from @TIME
  if (pathNodes.length >= 1 && pathNodes[0].type === 'VariableReference') {
    const varRef = pathNodes[0] as any;
    if (varRef.isSpecial && varRef.identifier) {
      const resolverManager = env.getResolverManager();
      if (resolverManager && resolverManager.isResolverName(varRef.identifier)) {
        return await evaluateResolverImport(directive, varRef.identifier, env);
      }
    }
  }
  
  // Check if this is a URL path based on the path node structure
  const pathNode = pathNodes[0]; // Assuming single path node for imports
  const isURL = pathNode?.subtype === 'urlPath' || pathNode?.subtype === 'urlSectionPath';
  
  // Resolve the import path (handles both file paths and URLs)
  const importPath = (await interpolate(pathNodes, env)).trim();
  let resolvedPath: string;
  
  // Check if this is a module reference (@prefix/ pattern)
  if (importPath.startsWith('@')) {
    // Extract hash from the module reference if present
    let moduleRef = importPath;
    let expectedHash: string | undefined;
    
    // Check if the directive has hash information in metadata
    const pathMeta = directive.meta?.path;
    if (pathMeta && pathMeta.hash) {
      expectedHash = pathMeta.hash;
      // Remove hash from module reference for resolution
      const hashIndex = importPath.lastIndexOf('@');
      if (hashIndex > 0) {
        moduleRef = importPath.substring(0, hashIndex);
      }
    }
    
    // Use the ResolverManager for @prefix/ patterns
    const resolverManager = env.getResolverManager();
    if (resolverManager) {
      try {
        // ResolverManager will handle all @prefix/ patterns including @user/module
        const resolverContent = await env.resolveModule(moduleRef, 'import');
        
        // Validate content type for imports
        if (resolverContent.contentType !== 'module') {
          throw new Error(
            `Import target is not a module: ${moduleRef} (content type: ${resolverContent.contentType})`
          );
        }
        
        // For module imports from resolvers, we already have the content
        // so we can process it directly instead of going through importFromPath
        return await importFromResolverContent(directive, moduleRef, resolverContent, env);
      } catch (error) {
        // If resolver fails, let the original error bubble up so dev mode can handle it
        throw error;
      }
    } else {
      // No ResolverManager available
      throw new Error(`Cannot resolve module '${moduleRef}': Module resolution not configured`);
    }
  } else if (isURL || env.isURL(importPath)) {
    // For URLs, use the URL as-is (no path resolution needed)
    resolvedPath = importPath;
  } else {
    // For file paths, resolve relative to current basePath
    resolvedPath = await env.resolvePath(importPath);
  }
  
  // Use the common import logic, passing the expected hash if present
  const pathMeta = directive.meta?.path;
  const expectedHash = pathMeta?.hash;
  return importFromPath(directive, resolvedPath, env, expectedHash);
}

/**
 * Import from resolver content (already resolved)
 */
async function importFromResolverContent(
  directive: DirectiveNode,
  ref: string,
  resolverContent: { content: string; contentType: 'module' | 'data' | 'text'; metadata?: any },
  env: Environment
): Promise<EvalResult> {
  const content = resolverContent.content;
  
  // Check for circular imports
  if (env.isImporting(ref)) {
    throw new Error(`Circular import detected: ${ref}`);
  }
  
  try {
    // Mark that we're importing this reference
    env.beginImport(ref);
    
    // Handle section extraction if specified
    let processedContent = content;
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env);
      if (section) {
        processedContent = extractSection(content, section);
      }
    }
    
    // Parse the imported content
    const parseResult = await parse(processedContent);
    
    // Check if parsing succeeded
    if (!parseResult.success) {
      const parseError = parseResult.error;
      if (parseError && 'location' in parseError) {
        throw new Error(
          `Syntax error in imported module '${ref}' at line ${parseError.location?.start?.line || '?'}: ${parseError.message || 'Unknown parse error'}`
        );
      } else {
        throw new Error(
          `Failed to parse imported module '${ref}': ${parseError?.message || 'Unknown parse error'}`
        );
      }
    }
    
    const ast = parseResult.ast;
    
    // Check for frontmatter in the AST and check version compatibility
    let frontmatterData: Record<string, any> | null = null;
    if (ast.length > 0 && ast[0].type === 'Frontmatter') {
      const { parseFrontmatter } = await import('../utils/frontmatter-parser');
      const frontmatterNode = ast[0] as any;
      frontmatterData = parseFrontmatter(frontmatterNode.content);
      
      // Check mlld version compatibility
      const requiredVersion = frontmatterData['mlld-version'] || 
                             frontmatterData['mlldVersion'] ||
                             frontmatterData['mlld_version'];
      
      if (requiredVersion) {
        const versionCheck = checkMlldVersion(requiredVersion);
        if (!versionCheck.compatible) {
          const moduleName = frontmatterData.module || 
                           frontmatterData.name || 
                           ref;
          
          throw new MlldError(
            formatVersionError(moduleName, requiredVersion, currentMlldVersion),
            { 
              code: 'VERSION_MISMATCH', 
              severity: 'error',
              module: moduleName,
              requiredVersion,
              path: ref
            }
          );
        }
      }
    }
    
    // Create a child environment for the imported module
    // For modules from resolvers, use current directory as basePath
    const childEnv = env.createChild(env.getBasePath());
    
    // Set the current file path for the imported module (for error reporting)
    childEnv.setCurrentFilePath(ref);
    
    // Evaluate the imported module
    let result: EvalResult;
    try {
      result = await evaluate(ast, childEnv);
    } catch (error) {
      throw new Error(
        `Error evaluating imported module '${ref}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    // Get variables from child environment
    const childVars = childEnv.getCurrentVariables();
    
    // Process module exports (explicit or auto-generated)
    const { moduleObject, frontmatter } = processModuleExports(childVars, { frontmatter: frontmatterData });
    
    // Add __meta__ property with frontmatter if available
    if (frontmatter) {
      moduleObject.__meta__ = frontmatter;
    }
    
    // Handle variable merging based on import type (same as importFromPath)
    if (directive.subtype === 'importAll') {
      // Import all properties from the module object
      for (const [name, value] of Object.entries(moduleObject)) {
        if (name === '__meta__') continue;
        
        let varType: 'text' | 'data' | 'path' | 'command' | 'import' | 'executable' = 'data';
        let varValue = value;
        
        if (value && typeof value === 'object' && '__variableType' in value && '__value' in value) {
          varType = value.__variableType;
          varValue = value.__value;
          
          // Handle backward compatibility: convert textTemplate to executable
          if (varType === 'textTemplate') {
            varType = 'executable';
          }
        }
        
        const importedVariable: MlldVariable = {
          type: varType,
          identifier: name,
          value: varValue,
          nodeId: '',
          location: { line: 0, column: 0 },
          metadata: {
            isImported: true,
            importPath: ref,
            definedAt: { line: 0, column: 0, filePath: ref }
          }
        };
        
        // For executable variables, restore the full structure
        if (varType === 'executable' && value && typeof value === 'object') {
          if ('__definition' in value) {
            (importedVariable as any).definition = value.__definition;
          } else {
            // Legacy textTemplate: create text type definition
            (importedVariable as any).definition = {
              type: 'text',
              params: value.__params || [],
              content: value.__content || []
            };
          }
          (importedVariable as any).params = value.__params || [];
          (importedVariable as any).content = value.__content || [];
        }
        // For legacy command variables, convert to executable
        else if (varType === 'command' && value && typeof value === 'object') {
          varType = 'executable';
          importedVariable.type = varType;
          (importedVariable as any).definition = {
            type: 'command',
            params: value.__params || [],
            command: value.__value || value.__command || []
          };
          (importedVariable as any).params = value.__params || [];
        }
        env.setVariable(name, importedVariable);
      }
    } else if (directive.subtype === 'importSelected') {
      // Import selected variables - use same structure as importFromPath
      const imports = directive.values?.imports || [];
      for (const importNode of imports) {
        const varName = importNode.identifier;
        
        // Check if the variable exists in the module object
        if (varName in moduleObject && varName !== '__meta__') {
          const value = moduleObject[varName];
          // Use alias if provided, otherwise use original name
          const targetName = importNode.alias || varName;
          
          // Default to 'data' type, but this will be overridden by the actual type from __variableType
          let varType: 'text' | 'data' | 'path' | 'command' | 'import' | 'executable' = 'data';
          let varValue = value;
          
          // Extract the actual variable type from the module export
          if (value && typeof value === 'object' && '__variableType' in value && '__value' in value) {
            varType = value.__variableType;
            varValue = value.__value;
            
            // Handle backward compatibility: convert textTemplate to executable
            if (varType === 'textTemplate') {
              varType = 'executable';
            }
          }
          
          const importedVariable: MlldVariable = {
            type: varType,
            identifier: targetName,
            value: varValue,
            nodeId: '',
            location: { line: 0, column: 0 },
            metadata: {
              isImported: true,
              importPath: ref,
              originalName: varName !== targetName ? varName : undefined,
              definedAt: { line: 0, column: 0, filePath: ref }
            }
          };
          
          // For executable variables, restore the full structure
          if (varType === 'executable' && value && typeof value === 'object') {
            if ('__definition' in value) {
              (importedVariable as any).definition = value.__definition;
            } else {
              // Legacy textTemplate: create text type definition
              (importedVariable as any).definition = {
                type: 'text',
                params: value.__params || [],
                content: value.__content || []
              };
            }
            (importedVariable as any).params = value.__params || [];
            (importedVariable as any).content = value.__content || [];
          }
          // For legacy command variables, convert to executable
          else if (varType === 'command' && value && typeof value === 'object') {
            varType = 'executable';
            importedVariable.type = varType;
            (importedVariable as any).definition = {
              type: 'command',
              params: value.__params || [],
              command: value.__value || value.__command || []
            };
            (importedVariable as any).params = value.__params || [];
          }
          // Legacy textTemplate handling for backward compatibility
          else if (varType === 'textTemplate' && value && typeof value === 'object') {
            // This shouldn't happen anymore due to conversion above, but keeping for safety
            (importedVariable as any).params = value.__params;
            (importedVariable as any).content = value.__content;
          }
          
          env.setVariable(targetName, importedVariable);
        } else {
          // Variable not found in module exports
          const availableExports = Object.keys(moduleObject).filter(k => k !== '__meta__');
          throw new Error(
            `Variable '${varName}' not found in module exports from ${ref}. ` +
            `Available exports: ${availableExports.join(', ')}`
          );
        }
      }
    }
    
    return { 
      type: 'composite',
      values: []
    };
  } finally {
    env.endImport(ref);
  }
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
 * Evaluate resolver import.
 * Handles importing data from built-in resolvers like @TIME, @DEBUG, @PROJECTPATH
 */
async function evaluateResolverImport(
  directive: DirectiveNode,
  resolverName: string,
  env: Environment
): Promise<EvalResult> {
  const resolverManager = env.getResolverManager();
  if (!resolverManager) {
    throw new Error('Resolver manager not available');
  }

  const resolver = resolverManager.getResolver(resolverName.toUpperCase());
  if (!resolver) {
    throw new Error(`Resolver '${resolverName}' not found`);
  }

  // Check if resolver supports imports
  if (!resolver.capabilities.contexts.import) {
    const { ResolverError } = await import('@core/errors');
    throw ResolverError.unsupportedCapability(resolver.name, 'imports', 'import');
  }

  // Get export data from resolver
  let exportData: Record<string, any> = {};
  
  if ('getExportData' in resolver) {
    // Handle selected imports with format support
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];
      
      // For single format import like: @import { "iso" as date } from @TIME
      if (imports.length === 1) {
        const importNode = imports[0];
        const format = importNode.identifier.replace(/^["']|["']$/g, ''); // Remove quotes
        
        // Check if this is a format string (quoted)
        if (importNode.identifier.startsWith('"') || importNode.identifier.startsWith("'")) {
          exportData = await (resolver as any).getExportData(format);
          
          // If no alias provided, use the format as the variable name
          const varName = importNode.alias || format;
          const value = exportData[format];
          
          if (value !== undefined) {
            env.setVariable(varName, {
              type: typeof value === 'string' ? 'text' : 'data',
              value: value,
              nodeId: '',
              location: directive.location || { line: 0, column: 0 },
              metadata: {
                isImported: true,
                importPath: `@${resolverName}`,
                definedAt: directive.location || { line: 0, column: 0, filePath: env.getCurrentFilePath() }
              }
            });
          } else {
            throw new Error(`Format '${format}' not supported by resolver '${resolverName}'`);
          }
          
          return { value: undefined, env };
        }
      }
      
      // Otherwise get all export data for field selection
      exportData = await (resolver as any).getExportData();
    } else {
      // Import all - get all export data
      exportData = await (resolver as any).getExportData();
    }
  } else {
    // Fallback: use resolver.resolve with import context
    const requestedImports = directive.subtype === 'importSelected' 
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;
    
    const result = await resolver.resolve(`@${resolverName}`, {
      context: 'import',
      requestedImports
    });
    
    // If content is JSON string (data type), parse it
    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        exportData = JSON.parse(result.content);
      } catch (e) {
        exportData = { value: result.content };
      }
    } else {
      exportData = { value: result.content };
    }
  }

  // Convert export data to variables
  const variables: Map<string, MlldVariable> = new Map();
  
  for (const [key, value] of Object.entries(exportData)) {
    variables.set(key, {
      type: typeof value === 'string' ? 'text' : 'data',
      value: value,
      nodeId: '',
      location: directive.location || { line: 0, column: 0 },
      metadata: {
        isImported: true,
        importPath: `@${resolverName}`,
        definedAt: directive.location || { line: 0, column: 0, filePath: env.getCurrentFilePath() }
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
      
      // Skip if already handled as format import
      if (varName.startsWith('"') || varName.startsWith("'")) {
        continue;
      }
      
      const variable = variables.get(varName);
      if (variable) {
        // Use alias if provided, otherwise use original name
        const targetName = importNode.alias || varName;
        env.setVariable(targetName, variable);
      } else {
        // Variable not found in export data
        throw new Error(`Variable '${varName}' not found in resolver '${resolverName}' exports`);
      }
    }
  }

  // Imports are definition directives - they don't produce output
  return { value: undefined, env };
}

/**
 * Evaluate input import.
 * Handles importing data from @INPUT/@input with JSON auto-detection.
 */
async function evaluateInputImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // For @INPUT imports, use the merged @INPUT variable that includes env vars
  // For @stdin imports (legacy), fall back to raw stdin content
  const inputVariable = env.getVariable('INPUT');
  let inputData: any = null;
  
  if (inputVariable && inputVariable.value !== null) {
    // Use the merged @INPUT variable (includes env vars + stdin)
    inputData = inputVariable.value;
  } else {
    // Fallback to raw stdin for legacy @stdin imports or if no @INPUT
    const rawStdinContent = env.getRawStdinContent();
    if (!rawStdinContent) {
      // Check if there are any environment variables available
      // This ensures @INPUT works even without stdin if env vars are allowed
      throw new Error('No input data available. @stdin/@INPUT imports require data to be provided via stdin or allowed environment variables.');
    }
    
    // Try to parse raw stdin as JSON
    try {
      inputData = JSON.parse(rawStdinContent);
    } catch {
      inputData = rawStdinContent;
    }
  }
  
  if (inputData === null || inputData === undefined) {
    throw new Error('No input data available. @stdin/@INPUT imports require data to be provided via stdin.');
  }
  
  // Convert inputData to variables
  const variables: Map<string, MlldVariable> = new Map();
  
  if (typeof inputData === 'object' && inputData !== null && !Array.isArray(inputData)) {
    // Object data - extract fields as variables
    for (const [key, value] of Object.entries(inputData)) {
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
    // Non-object data (array, string, number, etc.) - store as 'content'
    variables.set('content', {
      type: 'data',
      value: inputData,
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