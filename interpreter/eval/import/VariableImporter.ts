import type { DirectiveNode } from '@core/types';
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
  getEffectiveType,
  VariableTypeGuards
} from '@core/types/variable';
import type { Environment } from '../../env/Environment';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
import type { ShadowEnvironmentCapture } from '../../env/types/ShadowEnvironmentCapture';

export interface ModuleProcessingResult {
  moduleObject: Record<string, any>;
  frontmatter: Record<string, any> | null;
  childEnvironment: Environment;
}

/**
 * Handles variable creation, type inference, and environment merging for imports
 */
export class VariableImporter {
  constructor(private objectResolver: ObjectReferenceResolver) {}
  
  /**
   * Serialize shadow environments for export (Maps to objects)
   * WHY: Maps don't serialize to JSON, so we convert them to plain objects
   * GOTCHA: Function references are preserved directly
   */
  private serializeShadowEnvs(envs: ShadowEnvironmentCapture): any {
    const result: any = {};
    
    for (const [lang, shadowMap] of Object.entries(envs)) {
      if (shadowMap instanceof Map && shadowMap.size > 0) {
        // Convert Map to object
        const obj: Record<string, any> = {};
        for (const [name, func] of shadowMap) {
          obj[name] = func;
        }
        result[lang] = obj;
      }
    }
    
    return result;
  }
  
  /**
   * Deserialize shadow environments after import (objects to Maps)  
   * WHY: Shadow environments are expected as Maps internally
   */
  private deserializeShadowEnvs(envs: any): ShadowEnvironmentCapture {
    const result: ShadowEnvironmentCapture = {};
    
    for (const [lang, shadowObj] of Object.entries(envs)) {
      if (shadowObj && typeof shadowObj === 'object') {
        // Convert object to Map
        const map = new Map<string, any>();
        for (const [name, func] of Object.entries(shadowObj)) {
          map.set(name, func);
        }
        result[lang as keyof ShadowEnvironmentCapture] = map;
      }
    }
    
    return result;
  }

  /**
   * Import variables from a processing result into the target environment
   */
  async importVariables(
    processingResult: ModuleProcessingResult,
    directive: DirectiveNode,
    targetEnv: Environment
  ): Promise<void> {
    const { moduleObject } = processingResult;
    
    // Handle variable merging based on import type
    await this.handleImportType(directive, moduleObject, targetEnv, processingResult.childEnvironment);
  }

  /**
   * Process module exports - either use explicit @data module or auto-generate
   */
  processModuleExports(
    childVars: Map<string, Variable>,
    parseResult: any
  ): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null } {
    // Extract frontmatter if present
    const frontmatter = parseResult.frontmatter || null;
    
    // Always start with auto-export of all top-level variables
    const moduleObject: Record<string, any> = {};
    
    // Export all top-level variables directly (except system variables)
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processModuleExports] childVars size: ${childVars.size}`);
      console.log(`[processModuleExports] childVars keys: ${Array.from(childVars.keys()).join(', ')}`);
    }
    
    for (const [name, variable] of childVars) {
      // Only export legitimate mlld variables - this automatically excludes
      // system variables like frontmatter (@fm) that don't have valid mlld types
      if (!this.isLegitimateVariableForExport(variable)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log(`[processModuleExports] Skipping non-legitimate variable '${name}' with type: ${variable.type}`);
        }
        continue;
      }
      if (process.env.DEBUG_MODULE_EXPORT || process.env.MLLD_DEBUG === 'true') {
        console.error(`[DEBUG] Exporting variable '${name}' of type '${variable.type}'`);
      }
      // For executable variables, we need to preserve the full structure
      if (variable.type === 'executable') {
        const execVar = variable as ExecutableVariable;
        
        // Serialize shadow environments if present (Maps don't serialize to JSON)
        let serializedMetadata = { ...execVar.metadata };
        if (serializedMetadata.capturedShadowEnvs) {
          serializedMetadata = {
            ...serializedMetadata,
            capturedShadowEnvs: this.serializeShadowEnvs(serializedMetadata.capturedShadowEnvs)
          };
        }
        
        // Export executable with all necessary metadata
        moduleObject[name] = {
          __executable: true,
          value: execVar.value,
          // paramNames removed - they're already in executableDef and shouldn't be exposed as imports
          executableDef: execVar.metadata?.executableDef,
          metadata: serializedMetadata
        };
      } else if (variable.type === 'object' && typeof variable.value === 'object' && variable.value !== null) {
        // For objects, resolve any variable references within the object
        const resolvedObject = this.objectResolver.resolveObjectReferences(variable.value, childVars);
        moduleObject[name] = resolvedObject;
      } else {
        // For other variables, export the value directly
        moduleObject[name] = variable.value;
      }
    }
    
    return {
      moduleObject,
      frontmatter
    };
  }

  /**
   * Create a variable from an imported value, inferring the type
   */
  createVariableFromValue(
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
      return this.createExecutableFromImport(name, value, source, metadata);
    }
    
    // Infer the variable type from the value
    const originalType = this.inferVariableType(value);
    
    // Convert non-string primitives to strings
    let processedValue = value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      processedValue = String(value);
    }
    
    // For object types, create an ObjectVariable to preserve field access capability
    if (originalType === 'object') {
      // Check if the object contains complex AST nodes that need evaluation
      const isComplex = this.hasComplexContent(processedValue);
      
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
   * Create a namespace variable for imports with aliased wildcards (e.g., * as config)
   */
  createNamespaceVariable(
    alias: string, 
    moduleObject: Record<string, any>, 
    importPath: string
  ): Variable {
    const source: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };

    // Check if the namespace contains complex content (like executables)
    const isComplex = this.hasComplexContent(moduleObject);
    
    return createObjectVariable(
      alias,
      moduleObject,
      isComplex, // Mark as complex if it contains AST nodes or executables
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
   * Merge variables into the target environment based on import type
   */
  private async handleImportType(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    if (directive.subtype === 'importAll') {
      throw new MlldImportError(
        'Wildcard imports \'/import { * }\' are no longer supported. ' +
        'Use namespace imports instead: \'/import "file"\' or \'/import "file" as name\'',
        directive.location,
        {
          suggestion: 'Change \'/import { * } from "file"\' to \'/import "file"\''
        }
      );
    } else if (directive.subtype === 'importNamespace') {
      await this.handleNamespaceImport(directive, moduleObject, targetEnv, childEnv);
    } else if (directive.subtype === 'importSelected') {
      await this.handleSelectedImport(directive, moduleObject, targetEnv, childEnv);
    } else {
      throw new Error(`Unknown import subtype: ${directive.subtype}`);
    }
  }

  /**
   * Handle namespace imports
   */
  private async handleNamespaceImport(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    // For shorthand imports, namespace is stored as an array in values.namespace
    const namespaceNodes = directive.values?.namespace;
    const alias = (namespaceNodes && Array.isArray(namespaceNodes) && namespaceNodes[0]?.content) 
      ? namespaceNodes[0].content 
      : directive.values?.imports?.[0]?.alias;
    
    if (!alias) {
      throw new Error('Namespace import missing alias');
    }
    
    // Smart namespace unwrapping: If the module exports a single main object
    // with a conventional name, unwrap it for better ergonomics
    let namespaceObject = moduleObject;
    
    // Get the module name from the import path
    const importPath = directive.values?.from?.[0]?.content || '';
    const moduleName = importPath.split('/').pop()?.replace(/\.mld$/, '') || '';
    
    // Check if there's a single export with the module name or common patterns
    const exportKeys = Object.keys(moduleObject);
    const commonNames = [moduleName, 'main', 'default', 'exports'];
    
    // If there's only one export, or if there's an export matching common patterns
    if (exportKeys.length === 1) {
      // Single export - use it directly
      namespaceObject = moduleObject[exportKeys[0]];
    } else {
      // Multiple exports - check for common patterns
      for (const name of commonNames) {
        if (name && moduleObject[name] && typeof moduleObject[name] === 'object') {
          // Found a main export object - check if it looks like the primary export
          const mainExport = moduleObject[name];
          const otherExports = exportKeys.filter(k => k !== name && !k.startsWith('_'));
          
          // If the main export has most of the functionality, use it
          if (Object.keys(mainExport).length > otherExports.length) {
            namespaceObject = mainExport;
            break;
          }
        }
      }
    }
    
    // Create namespace variable with the (potentially unwrapped) object
    const namespaceVar = this.createNamespaceVariable(
      alias, 
      namespaceObject, 
      childEnv.getCurrentFilePath() || 'unknown'
    );
    
    targetEnv.setVariable(alias, namespaceVar);
  }

  /**
   * Handle selected imports
   */
  private async handleSelectedImport(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    const imports = directive.values?.imports || [];
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    
    for (const importItem of imports) {
      const importName = importItem.identifier;
      const alias = importItem.alias || importName;
      
      if (!(importName in moduleObject)) {
        throw new Error(`Import '${importName}' not found in module`);
      }
      
      const importedValue = moduleObject[importName];
      const variable = this.createVariableFromValue(alias, importedValue, importPath, importName);
      
      if (process.env.DEBUG_MODULE_EXPORT) {
        console.error(`[DEBUG] Importing '${importName}' as '${alias}' with metadata:`, variable.metadata);
      }
      
      targetEnv.setVariable(alias, variable);
    }
  }

  /**
   * Create an executable variable from import metadata
   */
  private createExecutableFromImport(
    name: string,
    value: any,
    source: VariableSource,
    metadata: any
  ): ExecutableVariable {
    // This is an executable variable - reconstruct it properly
    const execValue = value.value;
    const executableDef = value.executableDef;
    // Get paramNames from executableDef where it's properly stored
    const paramNames = executableDef?.paramNames || [];
    
    // The executable definition contains all the needed information
    // We just need to create a dummy ExecutableVariable that preserves it
    // The actual execution will use the executableDef from metadata
    // OLD CODE that might lose metadata:
    // return createExecutableVariable(
    //   name,
    //   value.value.type,
    //   value.value.template || '',
    //   value.value.paramNames || [],
    //   value.value.language,
    //   source,
    //   metadata
    // );
    
    // NEW CODE: Ensure all metadata is preserved
    let originalMetadata = value.metadata || {};
    
    // Deserialize shadow environments if present
    if (originalMetadata.capturedShadowEnvs) {
      originalMetadata = {
        ...originalMetadata,
        capturedShadowEnvs: this.deserializeShadowEnvs(originalMetadata.capturedShadowEnvs)
      };
    }
    
    const enhancedMetadata = {
      ...metadata,
      ...originalMetadata, // Preserve ALL original metadata including capturedShadowEnvs
      isImported: true,
      importPath: metadata.importPath,
      executableDef // This is what actually matters for execution
    };
    
    const execVariable = createExecutableVariable(
      name,
      'command', // Default type - the real type is in executableDef
      '', // Empty template - the real template is in executableDef
      paramNames,
      undefined, // No language here - it's in executableDef
      source,
      enhancedMetadata
    );
    
    return execVariable;
  }

  /**
   * Check if a value contains complex AST nodes that need evaluation
   */
  private hasComplexContent(value: any): boolean {
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
      return value.some(item => this.hasComplexContent(item));
    }
    
    // Recursively check object properties
    for (const prop of Object.values(value)) {
      if (this.hasComplexContent(prop)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Infer variable type from value
   */
  private inferVariableType(value: any): VariableTypeDiscriminator {
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
   * Check if a variable is a legitimate mlld variable that can be exported/imported.
   * System variables (marked with metadata.isSystem) are excluded from exports to prevent
   * namespace collisions when importing multiple modules with system variables like @fm.
   */
  private isLegitimateVariableForExport(variable: Variable): boolean {
    // System variables (like @fm) should not be exported
    if (variable.metadata?.isSystem) {
      return false;
    }
    
    // All user-created variables are exportable
    // This includes variables created by /var, /exe, /path directives
    return true;
  }
}