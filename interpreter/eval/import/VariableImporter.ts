import type { DirectiveNode } from '@core/types';
import type { Variable, VariableSource, VariableTypeDiscriminator, ExecutableVariable } from '@core/types/variable';
import { 
  createImportedVariable, 
  createObjectVariable,
  createArrayVariable,
  createSimpleTextVariable,
  createPathVariable,
  createExecutableVariable,
  createTemplateVariable,
  isExecutable,
  isExecutableVariable,
  getEffectiveType,
  VariableTypeGuards
} from '@core/types/variable';
import type { Environment } from '../../env/Environment';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
import type { ShadowEnvironmentCapture } from '../../env/types/ShadowEnvironmentCapture';
import { ExportManifest } from './ExportManifest';
import { astLocationToSourceLocation } from '@core/types';
import type { SourceLocation } from '@core/types';

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
   * Checks whether the requested alias has already been claimed during the
   * current import pass and throws a detailed error when a collision exists.
   */
  private ensureImportBindingAvailable(
    targetEnv: Environment,
    name: string,
    importSource: string,
    location?: SourceLocation
  ): void {
    if (!name) return;
    const existingBinding = targetEnv.getImportBinding(name);
    if (!existingBinding) {
      return;
    }

    throw new MlldImportError(
      `Import collision - '${name}' already imported from ${existingBinding.source}. Alias one of the imports.`,
      {
        code: 'IMPORT_NAME_CONFLICT',
        context: {
          name,
          existingSource: existingBinding.source,
          attemptedSource: importSource,
          existingLocation: existingBinding.location,
          newLocation: location,
          suggestion: "Use 'as' to alias one of the imports"
        },
        details: {
          filePath: location?.filePath || existingBinding.location?.filePath,
          variableName: name
        }
      }
    );
  }

  /**
   * Writes the variable and persists the associated binding only after the
   * assignment succeeds, preventing partially-applied imports from polluting
   * the collision tracking map.
   */
  private setVariableWithImportBinding(
    targetEnv: Environment,
    alias: string,
    variable: Variable,
    binding: { source: string; location?: SourceLocation }
  ): void {
    let shouldPersistBinding = false;
    try {
      targetEnv.setVariable(alias, variable);
      shouldPersistBinding = true;
    } finally {
      if (shouldPersistBinding) {
        targetEnv.setImportBinding(alias, binding);
      }
    }
  }

  /**
   * Serialize module environment for export (Map to object)
   * WHY: Maps don't serialize to JSON, so we need to convert to exportable format
   * IMPORTANT: Use the exact same serialization as processModuleExports to ensure compatibility
   */
  private serializeModuleEnv(moduleEnv: Map<string, Variable>): any {
    // Create a temporary childVars map and reuse processModuleExports logic
    // Skip module env serialization to prevent infinite recursion
    const tempResult = this.processModuleExports(moduleEnv, {}, true);
    return tempResult.moduleObject;
  }

  /**
   * Deserialize module environment after import (object to Map)
   * IMPORTANT: Reuse createVariableFromValue to ensure proper Variable reconstruction
   */
  deserializeModuleEnv(moduleEnv: any): Map<string, Variable> {
    const result = new Map<string, Variable>();
    if (moduleEnv && typeof moduleEnv === 'object') {
      for (const [name, varData] of Object.entries(moduleEnv)) {
        // Reuse the existing variable creation logic
        const variable = this.createVariableFromValue(
          name,
          varData,
          'module-env', // Use a special import path to indicate this is from module env
          name
        );
        result.set(name, variable);
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
    parseResult: any,
    skipModuleEnvSerialization?: boolean,
    manifest?: ExportManifest | null
  ): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null } {
    // Extract frontmatter if present
    const frontmatter = parseResult.frontmatter || null;

    // Always start with auto-export of all top-level variables
    const moduleObject: Record<string, any> = {};
    const explicitNames = manifest?.hasEntries() ? manifest.getNames() : null;
    const explicitExports = explicitNames ? new Set(explicitNames) : null;
    if (explicitNames && explicitNames.length > 0) {
      // Fail fast if the manifest references names that never materialised in
      // the child environment so authors receive a precise directive pointer.
      for (const name of explicitNames) {
        if (!childVars.has(name)) {
          const location = manifest?.getLocation(name);
          throw new MlldImportError(
            `Exported name '${name}' is not defined in this module`,
            {
              code: 'EXPORTED_NAME_NOT_FOUND',
              context: {
                exportName: name,
                location
              },
              details: {
                filePath: location?.filePath,
                variableName: name
              }
            }
          );
        }
      }
    }
    const shouldSerializeModuleEnv = !skipModuleEnvSerialization;
    let moduleEnvSnapshot: Map<string, Variable> | null = null;
    const getModuleEnvSnapshot = () => {
      if (!moduleEnvSnapshot) {
        moduleEnvSnapshot = new Map(childVars);
      }
      return moduleEnvSnapshot;
    };
    
    // Export all top-level variables directly (except system variables)
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processModuleExports] childVars size: ${childVars.size}`);
      console.log(`[processModuleExports] childVars keys: ${Array.from(childVars.keys()).join(', ')}`);
    }
    
    for (const [name, variable] of childVars) {
      if (explicitExports && !explicitExports.has(name)) {
        continue;
      }
      // Only export legitimate mlld variables - this automatically excludes
      // system variables like frontmatter (@fm) that don't have valid mlld types
      if (!this.isLegitimateVariableForExport(variable)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log(`[processModuleExports] Skipping non-legitimate variable '${name}' with type: ${variable.type}`);
        }
        continue;
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
        // Serialize module environment if present
        if (shouldSerializeModuleEnv) {
          const capturedEnv = serializedMetadata.capturedModuleEnv instanceof Map
            ? serializedMetadata.capturedModuleEnv
            : getModuleEnvSnapshot();
          serializedMetadata = {
            ...serializedMetadata,
            capturedModuleEnv: this.serializeModuleEnv(capturedEnv)
          };
        } else {
          // Remove capturedModuleEnv to avoid recursion
          delete serializedMetadata.capturedModuleEnv;
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
    
    // Check if this is a template export
    if (value && typeof value === 'object' && (value as any).__template) {
      const templateSource: VariableSource = {
        directive: 'var',
        syntax: 'template',
        hasInterpolation: true,
        isMultiLine: true
      };
      const tmplMetadata = { ...metadata, templateAst: (value as any).templateAst };
      return createTemplateVariable(
        name,
        (value as any).content,
        undefined,
        (value as any).templateSyntax === 'tripleColon' ? 'tripleColon' : 'doubleColon',
        templateSource,
        tmplMetadata
      );
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

    const importerFilePath = targetEnv.getCurrentFilePath();
    const aliasLocationNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
    const aliasLocation = aliasLocationNode?.location
      ? astLocationToSourceLocation(aliasLocationNode.location, importerFilePath)
      : astLocationToSourceLocation(directive.location, importerFilePath);

    // Smart namespace unwrapping: If the module exports a single main object
    // with a conventional name, unwrap it for better ergonomics
    let namespaceObject = moduleObject;
    
    // Get the module name from the import path (for unwrapping heuristics)
    const importRef = directive.values?.from?.[0]?.content || '';
    const moduleName = importRef.split('/').pop()?.replace(/\.mld$/, '') || '';
    
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
    
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    const importDisplay = this.getImportDisplayPath(directive, importPath);
    const bindingInfo = { source: importDisplay, location: aliasLocation };

    this.ensureImportBindingAvailable(targetEnv, alias, importDisplay, aliasLocation);

    // If the unwrapped object is a template export, create a template variable instead
    if (namespaceObject && typeof namespaceObject === 'object' && (namespaceObject as any).__template) {
      const templateVar = this.createVariableFromValue(alias, namespaceObject, importPath);
      this.setVariableWithImportBinding(targetEnv, alias, templateVar, bindingInfo);
      return;
    }

    // Create namespace variable with the (potentially unwrapped) object
    const namespaceVar = this.createNamespaceVariable(
      alias,
      namespaceObject,
      importPath
    );
    this.setVariableWithImportBinding(targetEnv, alias, namespaceVar, bindingInfo);
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
    const importDisplay = this.getImportDisplayPath(directive, importPath);
    const importerFilePath = targetEnv.getCurrentFilePath();

    for (const importItem of imports) {
      const importName = importItem.identifier;
      const alias = importItem.alias || importName;

      if (!(importName in moduleObject)) {
        throw new Error(`Import '${importName}' not found in module`);
      }

      const bindingLocation = importItem?.location
        ? astLocationToSourceLocation(importItem.location, importerFilePath)
        : astLocationToSourceLocation(directive.location, importerFilePath);
      const bindingInfo = { source: importDisplay, location: bindingLocation };

      this.ensureImportBindingAvailable(targetEnv, alias, importDisplay, bindingLocation);

      const importedValue = moduleObject[importName];
      const variable = this.createVariableFromValue(alias, importedValue, importPath, importName);

      this.setVariableWithImportBinding(targetEnv, alias, variable, bindingInfo);
    }
  }

  /**
   * Produces a human-readable source string for error messages, stripping any
   * quotes that appeared in the original directive.
   */
  private getImportDisplayPath(directive: DirectiveNode, fallback: string): string {
    const raw = (directive as any)?.raw;
    if (raw && typeof raw.path === 'string' && raw.path.trim().length > 0) {
      const trimmed = raw.path.trim();
      return trimmed.replace(/^['"]|['"]$/g, '');
    }
    return fallback;
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

    // Deserialize module environment if present
    if (originalMetadata.capturedModuleEnv) {
      const deserializedEnv = this.deserializeModuleEnv(originalMetadata.capturedModuleEnv);

      // IMPORTANT: Each executable in the module env needs to have access to the full env
      // This allows command-refs to find their siblings
      for (const [_, variable] of deserializedEnv) {
        if (variable.type === 'executable' && variable.metadata) {
          // Give each executable in the module env access to all siblings
          variable.metadata.capturedModuleEnv = deserializedEnv;
        }
      }

      originalMetadata = {
        ...originalMetadata,
        capturedModuleEnv: deserializedEnv
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
