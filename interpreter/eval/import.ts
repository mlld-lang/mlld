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
  
  // Look for explicit module export
  const moduleVar = childVars.get('module');
  
  if (moduleVar && moduleVar.type === 'data') {
    // Use explicit module export
    // Handle DataObject type that might have type/properties structure
    let moduleValue = moduleVar.value;
    if (moduleValue && typeof moduleValue === 'object' && 
        moduleValue.type === 'object' && moduleValue.properties) {
      moduleValue = moduleValue.properties;
    }
    return {
      moduleObject: moduleValue,
      frontmatter
    };
  }
  
  // Auto-generate module export with all top-level variables
  const moduleObject: Record<string, any> = {};
  for (const [name, variable] of childVars) {
    // Skip the 'module' variable itself if it exists but isn't data type
    if (name !== 'module') {
      moduleObject[name] = variable.value;
    }
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
        // Include location information if available
        throw new Error(
          `Syntax error in imported file '${resolvedPath}' at line ${parseError.location?.start?.line || '?'}: ${parseError.message || 'Unknown parse error'}`
        );
      } else {
        throw new Error(
          `Failed to parse imported file '${resolvedPath}': ${parseError?.message || 'Unknown parse error'}`
        );
      }
    }
    
    const ast = parseResult.ast;
    
    // Check mlld version compatibility if frontmatter exists
    if (parseResult.frontmatter) {
      const requiredVersion = parseResult.frontmatter['mlld-version'] || 
                             parseResult.frontmatter['mlldVersion'] ||
                             parseResult.frontmatter['mlld_version'];
      
      if (requiredVersion) {
        if (process.env.MLLD_DEBUG_VERSION) {
          console.log(`[Version Check] Module requires: ${requiredVersion}, Current: ${currentMlldVersion}`);
        }
        const versionCheck = checkMlldVersion(requiredVersion);
        if (!versionCheck.compatible) {
          const moduleName = parseResult.frontmatter.module || 
                           parseResult.frontmatter.name || 
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
    const { moduleObject, frontmatter } = processModuleExports(childVars, parseResult);
    
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
        const importedVariable: MlldVariable = {
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
        };
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
          const importedVariable: MlldVariable = {
            type: 'data',
            identifier: targetName,
            value: value,
            nodeId: '',
            location: { line: 0, column: 0 },
            metadata: {
              isImported: true,
              importPath: resolvedPath,
              definedAt: { line: 0, column: 0, filePath: resolvedPath }
            }
          };
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
        // This returns a URL that we can then fetch
        const resolvedUrl = await env.resolveModule(moduleRef);
        resolvedPath = resolvedUrl;
        
        // We'll validate the hash after reading the content
      } catch (error) {
        // If resolver fails, let it bubble up with a clear error
        throw new Error(`Failed to resolve module '${moduleRef}': ${error instanceof Error ? error.message : String(error)}`);
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
  // For @INPUT imports, use the merged @INPUT variable that includes env vars
  // For @stdin imports (legacy), fall back to raw stdin content
  const inputVariable = env.getVariable('INPUT');
  let inputData: any = null;
  
  if (inputVariable) {
    // Use the merged @INPUT variable (includes env vars + stdin)
    inputData = inputVariable.value;
  } else {
    // Fallback to raw stdin for legacy @stdin imports or if no @INPUT
    const rawStdinContent = env.getRawStdinContent();
    if (!rawStdinContent) {
      throw new Error('No input data available. @stdin/@INPUT imports require data to be provided via stdin.');
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