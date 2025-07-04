import type { DirectiveNode, TextNode, ContentNode } from '@core/types';
import type { Variable, VariableSource, VariableTypeDiscriminator, ExecutableVariable } from '@core/types/variable';
import { 
  createImportedVariable, 
  createObjectVariable,
  createArrayVariable,
  createSimpleTextVariable,
  createPathVariable,
  createExecutableVariable,
  isExecutable,
  isExecutableVariable,
  getEffectiveType
} from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, evaluate } from '../core/interpreter';
import { parse } from '@grammar/parser';
import * as path from 'path';
import { VariableRedefinitionError, MlldError, MlldImportError } from '@core/errors';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { checkMlldVersion, formatVersionError } from '@core/utils/version-checker';
import { version as currentMlldVersion } from '@core/version';

type ContentNodeArray = ContentNode[];

/**
 * Resolve variable references within an object value
 * This handles cases like { ask: @claude_ask } where @claude_ask needs to be resolved
 */
function resolveObjectReferences(
  value: any,
  childVars: Map<string, Variable>
): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => resolveObjectReferences(item, childVars));
  }
  
  // Check if this is a VariableReference AST node
  if (typeof value === 'object' && value.type === 'VariableReference' && value.identifier) {
    const varName = value.identifier;
    const referencedVar = childVars.get(varName);
    
    if (process.env.DEBUG_EXEC) {
      console.log('DEBUG: resolveObjectReferences found VariableReference AST node:', {
        varName,
        found: !!referencedVar,
        referencedVarType: referencedVar?.type,
        availableVars: Array.from(childVars.keys())
      });
    }
    
    if (referencedVar) {
      // For executables, we need to export them with the proper structure
      if (referencedVar.type === 'executable') {
        const execVar = referencedVar as ExecutableVariable;
        return {
          __executable: true,
          value: execVar.value,
          paramNames: execVar.paramNames,
          executableDef: execVar.metadata?.executableDef,
          metadata: execVar.metadata
        };
      } else {
        // For other variable types, return the value directly
        return referencedVar.value;
      }
    } else {
      if (process.env.DEBUG_EXEC) {
        console.log('DEBUG: VariableReference AST node not found during import resolution:', varName);
      }
      throw new Error(`Variable reference @${varName} not found during import`);
    }
  }
  
  if (typeof value === 'object') {
    // Handle AST object nodes with type and properties
    if (value.type === 'object' && value.properties) {
      const resolved: Record<string, any> = {};
      for (const [key, val] of Object.entries(value.properties)) {
        resolved[key] = resolveObjectReferences(val, childVars);
      }
      return {
        type: 'object',
        properties: resolved,
        location: value.location
      };
    }
    
    // Handle regular objects
    const resolved: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveObjectReferences(val, childVars);
    }
    return resolved;
  }
  
  // Check if this is a variable reference string (starts with @)
  if (typeof value === 'string' && value.startsWith('@')) {
    const varName = value.substring(1); // Remove @ prefix
    const referencedVar = childVars.get(varName);
    
    if (process.env.DEBUG_EXEC) {
      console.log('DEBUG: resolveObjectReferences looking for variable:', {
        originalValue: value,
        varName,
        found: !!referencedVar,
        referencedVarType: referencedVar?.type,
        availableVars: Array.from(childVars.keys())
      });
    }
    
    if (referencedVar) {
      // For executables, we need to export them with the proper structure
      if (referencedVar.type === 'executable') {
        const execVar = referencedVar as ExecutableVariable;
        return {
          __executable: true,
          value: execVar.value,
          paramNames: execVar.paramNames,
          executableDef: execVar.metadata?.executableDef,
          metadata: execVar.metadata
        };
      } else {
        // For other variable types, return the value directly
        return referencedVar.value;
      }
    } else {
      if (process.env.DEBUG_EXEC) {
        console.log('DEBUG: Variable not found during import resolution:', varName);
      }
    }
  }
  
  return value;
}

/**
 * Process module exports - either use explicit @data module or auto-generate
 */
function processModuleExports(
  childVars: Map<string, Variable>,
  parseResult: any
): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null } {
  // Extract frontmatter if present
  const frontmatter = parseResult.frontmatter || null;
  
  // Always start with auto-export of all top-level variables
  const moduleObject: Record<string, any> = {};
  
  // Export all top-level variables directly
  for (const [name, variable] of childVars) {
    // Skip the 'module' variable itself
    if (name !== 'module') {
      // For executable variables, we need to preserve the full structure
      if (variable.type === 'executable') {
        const execVar = variable as ExecutableVariable;
        // Export executable with all necessary metadata
        moduleObject[name] = {
          __executable: true,
          value: execVar.value,
          paramNames: execVar.paramNames,
          executableDef: execVar.metadata?.executableDef,
          metadata: execVar.metadata
        };
      } else if (variable.type === 'object' && typeof variable.value === 'object' && variable.value !== null) {
        // For objects, resolve any variable references within the object
        moduleObject[name] = resolveObjectReferences(variable.value, childVars);
      } else {
        // For other variables, export the value directly
        moduleObject[name] = variable.value;
      }
    }
  }
  
  // Then, if there's an explicit module export, add it as a structured export
  const moduleVar = childVars.get('module');
  if (moduleVar && (moduleVar.type === 'object' || moduleVar.type === 'array')) {
    // Export the module value directly
    moduleObject.module = moduleVar.value;
  }
  
  return {
    moduleObject,
    frontmatter
  };
}

/**
 * Create a variable from an imported value, inferring the type
 */
function createVariableFromValue(
  name: string,
  value: any,
  importPath: string,
  originalName?: string
): Variable {
  const source: VariableSource = {
    directive: 'var',
    syntax: Array.isArray(value) ? 'array' : 
            (value && typeof value === 'object') ? 'object' : 'quoted',
    hasInterpolation: false,
    isMultiLine: false
  };
  
  const metadata = {
    isImported: true,
    importPath,
    originalName: originalName !== name ? originalName : undefined,
    definedAt: { line: 0, column: 0, filePath: importPath }
  };
  
  // Check if this is an executable export
  if (value && typeof value === 'object' && '__executable' in value && value.__executable) {
    // This is an executable variable - reconstruct it properly
    const execValue = value.value;
    const paramNames = value.paramNames || [];
    const executableDef = value.executableDef;
    
    // The executable definition contains all the needed information
    // We just need to create a dummy ExecutableVariable that preserves it
    // The actual execution will use the executableDef from metadata
    const execVariable = createExecutableVariable(
      name,
      'command', // Default type - the real type is in executableDef
      '', // Empty template - the real template is in executableDef
      paramNames,
      undefined, // No language here - it's in executableDef
      source,
      {
        ...metadata,
        ...value.metadata,
        executableDef // This is what actually matters for execution
      }
    );
    
    return execVariable;
  }
  
  // Infer the variable type from the value
  const originalType = inferVariableType(value);
  
  // Convert non-string primitives to strings
  let processedValue = value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    processedValue = String(value);
  }
  
  // For object types, create an ObjectVariable to preserve field access capability
  // This fixes issue #299 where imported objects with function properties 
  // cannot be accessed via dot notation
  if (originalType === 'object') {
    // Check if the object contains complex AST nodes that need evaluation
    const isComplex = hasComplexContent(processedValue);
    
    return createObjectVariable(
      name,
      processedValue,
      isComplex, // Mark as complex if it contains AST nodes
      source,
      {
        ...metadata,
        isImported: true,
        importPath,
        originalName: originalName !== name ? originalName : undefined
      }
    );
  }
  
  // For non-objects, use createImportedVariable to preserve the original type info
  return createImportedVariable(
    name,
    processedValue,
    originalType,
    importPath,
    false,
    originalName || name,
    source,
    metadata
  );
}

/**
 * Check if a value contains complex AST nodes that need evaluation
 */
function hasComplexContent(value: any): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  
  // Check if this is an AST node with a type
  if (value.type) {
    return true;
  }
  
  // Check if it has __executable objects (from resolved executables)
  if (value.__executable) {
    return true;
  }
  
  // Recursively check arrays
  if (Array.isArray(value)) {
    return value.some(item => hasComplexContent(item));
  }
  
  // Recursively check object properties
  for (const prop of Object.values(value)) {
    if (hasComplexContent(prop)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Infer variable type from value
 */
function inferVariableType(value: any): VariableTypeDiscriminator {
  if (Array.isArray(value)) {
    return 'array';
  } else if (value && typeof value === 'object') {
    return 'object';
  } else if (typeof value === 'string') {
    return 'simple-text';
  } else {
    // Numbers, booleans, etc. convert to text
    return 'simple-text';
  }
}

/**
 * Create a namespace variable for imports with aliased wildcards (e.g., * as config)
 */
function createNamespaceVariable(
  alias: string, 
  moduleObject: Record<string, any>, 
  importPath: string
): Variable {
  // Create namespace variable using the new type system
  const source: VariableSource = {
    directive: 'var',
    syntax: 'object',
    hasInterpolation: false,
    isMultiLine: false
  };
  
  return createObjectVariable(
    alias,
    moduleObject,
    false,
    source,
    {
      isImported: true,
      importPath,
      isNamespace: true,
      definedAt: { line: 0, column: 0, filePath: importPath }
    }
  );
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
          throw new MlldImportError(
            "Wildcard imports '/import { * }' are no longer supported. " +
            "Use namespace imports instead: '/import [file]' or '/import [file] as name'",
            directive.location,
            {
              suggestion: "Change '/import { * } from [file]' to '/import [file]'"
            }
          );
        } else if (directive.subtype === 'importNamespace') {
          // Import entire JSON under a namespace alias
          // For shorthand imports, namespace is stored as an array in values.namespace
          const namespaceNodes = directive.values?.namespace;
          const alias = (namespaceNodes && Array.isArray(namespaceNodes) && namespaceNodes[0]?.content) 
            ? namespaceNodes[0].content 
            : directive.values?.imports?.[0]?.alias;
          
          if (!alias) {
            throw new Error('Namespace import missing alias');
          }
          
          // Create namespace variable with the JSON object
          const namespaceVariable = createNamespaceVariable(alias, moduleObject, resolvedPath);
          env.setVariable(alias, namespaceVariable);
        } else if (directive.subtype === 'importSelected') {
          // Import selected properties
          const imports = directive.values?.imports || [];
          for (const importNode of imports) {
            const varName = importNode.identifier;
            if (varName in moduleObject) {
              const targetName = importNode.alias || varName;
              const variable = createVariableFromValue(targetName, moduleObject[varName], resolvedPath, varName);
              env.setVariable(targetName, variable);
            } else {
              const availableExports = Object.keys(moduleObject).filter(k => 
                k !== '__meta__' && k !== 'fm' && k !== 'frontmatter'
              );
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
      throw new MlldImportError(
        "Wildcard imports '/import { * }' are no longer supported. " +
        "Use namespace imports instead: '/import [file]' or '/import [file] as name'",
        directive.location,
        {
          suggestion: "Change '/import { * } from [file]' to '/import [file]'"
        }
      );
    } else if (directive.subtype === 'importNamespace') {
      // Import entire module under a namespace
      // For shorthand imports, namespace is stored as an array in values.namespace
      const namespaceNodes = directive.values?.namespace;
      const namespace = (namespaceNodes && Array.isArray(namespaceNodes) && namespaceNodes[0]?.content) 
        ? namespaceNodes[0].content 
        : directive.values?.imports?.[0]?.alias;
      
      if (!namespace) {
        throw new Error('Namespace import missing alias');
      }
      
      // Create namespace variable with the module object
      const namespaceVariable = createNamespaceVariable(namespace, moduleObject, resolvedPath);
      env.setVariable(namespace, namespaceVariable);
      
    } else if (directive.subtype === 'importSelected') {
      // Import selected variables from the module object
      const imports = directive.values?.imports || [];
      for (const importNode of imports) {
        const varName = importNode.identifier;
        
        // Check if the variable exists in the module object
        if (varName in moduleObject && varName !== '__meta__' && varName !== 'fm' && varName !== 'frontmatter') {
          const value = moduleObject[varName];
          // Use alias if provided, otherwise use original name
          const targetName = importNode.alias || varName;
          
          // Create variable using the new type system
          const importedVariable = createVariableFromValue(targetName, value, resolvedPath, varName);
          env.setVariable(targetName, importedVariable);
        } else {
          // Variable not found in module exports
          const availableExports = Object.keys(moduleObject).filter(k => 
            k !== '__meta__' && k !== 'fm' && k !== 'frontmatter'
          );
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
  
  // Regular path interpolation - let variable resolution fail properly for quoted @prefixes
  const importPath = (await interpolate(pathNodes, env)).trim();
  let resolvedPath: string;
  
  // Check if this is a module reference (@prefix/ pattern)
  if (importPath.startsWith('@')) {
    // First check if it's a resolver name (like @TIME, @DEBUG, etc.)
    const resolverManager = env.getResolverManager();
    const potentialResolverName = importPath.substring(1); // Remove @ prefix
    
    if (resolverManager && resolverManager.isResolverName(potentialResolverName)) {
      // This is a resolver import, not a module
      return await evaluateResolverImport(directive, potentialResolverName, env);
    }
    
    // Otherwise, this is a module reference, proceed with module resolution
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
      throw new MlldImportError(
        "Wildcard imports '/import { * }' are no longer supported. " +
        "Use namespace imports instead: '/import [file]' or '/import [file] as name'",
        directive.location,
        {
          suggestion: "Change '/import { * } from [file]' to '/import [file]'"
        }
      );
    } else if (directive.subtype === 'importNamespace') {
      // Import entire module under a namespace
      // For shorthand imports, namespace is stored as an array in values.namespace
      const namespaceNodes = directive.values?.namespace;
      const alias = (namespaceNodes && Array.isArray(namespaceNodes) && namespaceNodes[0]?.content) 
        ? namespaceNodes[0].content 
        : directive.values?.imports?.[0]?.alias;
      
      if (!alias) {
        throw new Error('Namespace import missing alias');
      }
      
      // Create namespace variable with the module object
      const namespaceVariable = createNamespaceVariable(alias, moduleObject, ref);
      env.setVariable(alias, namespaceVariable);
      
    } else if (directive.subtype === 'importSelected') {
      // Import selected variables - use same structure as importFromPath
      const imports = directive.values?.imports || [];
      for (const importNode of imports) {
        const varName = importNode.identifier;
        
        // Check if the variable exists in the module object
        if (varName in moduleObject && varName !== '__meta__' && varName !== 'fm' && varName !== 'frontmatter') {
          const value = moduleObject[varName];
          // Use alias if provided, otherwise use original name
          const targetName = importNode.alias || varName;
          
          // Create variable using the new type system
          const importedVariable = createVariableFromValue(targetName, value, ref, varName);
          env.setVariable(targetName, importedVariable);
        } else {
          // Variable not found in module exports
          const availableExports = Object.keys(moduleObject).filter(k => 
            k !== '__meta__' && k !== 'fm' && k !== 'frontmatter'
          );
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
            const importedVariable = createVariableFromValue(varName, value, `@${resolverName}`, format);
            env.setVariable(varName, importedVariable);
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
  const variables: Map<string, Variable> = new Map();
  
  for (const [key, value] of Object.entries(exportData)) {
    const variable = createVariableFromValue(key, value, `@${resolverName}`);
    variables.set(key, variable);
  }

  // Handle variable merging based on import type
  if (directive.subtype === 'importAll') {
    throw new MlldImportError(
      "Wildcard imports '/import { * }' are no longer supported. " +
      "Use namespace imports instead: '/import [file]' or '/import [file] as name'",
      directive.location,
      {
        suggestion: "Change '/import { * } from [file]' to '/import [file]'"
      }
    );
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
  const variables: Map<string, Variable> = new Map();
  
  if (typeof inputData === 'object' && inputData !== null && !Array.isArray(inputData)) {
    // Object data - extract fields as variables
    for (const [key, value] of Object.entries(inputData)) {
      const variable = createVariableFromValue(key, value, '@INPUT');
      variables.set(key, variable);
    }
  } else {
    // Non-object data (array, string, number, etc.) - store as 'content'
    const variable = createVariableFromValue('content', inputData, '@INPUT');
    variables.set('content', variable);
  }
  
  // Handle variable merging based on import type
  if (directive.subtype === 'importAll') {
    throw new MlldImportError(
      "Wildcard imports '/import { * }' are no longer supported. " +
      "Use namespace imports instead: '/import [file]' or '/import [file] as name'",
      directive.location,
      {
        suggestion: "Change '/import { * } from [file]' to '/import [file]'"
      }
    );
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