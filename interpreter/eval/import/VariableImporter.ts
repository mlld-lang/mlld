import type { DirectiveNode } from '@core/types';
import type { Variable, VariableSource, VariableTypeDiscriminator, ExecutableVariable, VariableMetadata } from '@core/types/variable';
import { 
  createObjectVariable,
  createArrayVariable
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { isNodeProxy } from '@interpreter/utils/node-interop';
import type { Environment } from '../../env/Environment';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import type { ShadowEnvironmentCapture } from '../../env/types/ShadowEnvironmentCapture';
import { ExportManifest } from './ExportManifest';
import type { SerializedGuardDefinition } from '../../guards';
import { ImportBindingGuards } from './variable-importer/ImportBindingGuards';
import { MetadataMapParser } from './variable-importer/MetadataMapParser';
import { ModuleExportManifestValidator } from './variable-importer/ModuleExportManifestValidator';
import { GuardExportChecker } from './variable-importer/GuardExportChecker';
import { ModuleExportSerializer } from './variable-importer/ModuleExportSerializer';
import { ImportTypeRouter } from './variable-importer/ImportTypeRouter';
import { ImportVariableFactoryOrchestrator } from './variable-importer/factory/ImportVariableFactoryOrchestrator';
import { CapturedEnvRehydrator } from './variable-importer/executable/CapturedEnvRehydrator';
import { ExecutableImportRehydrator } from './variable-importer/executable/ExecutableImportRehydrator';
import { PolicyImportHandler } from './variable-importer/PolicyImportHandler';
import { NamespaceSelectedImportHandler } from './variable-importer/NamespaceSelectedImportHandler';

export interface ModuleProcessingResult {
  moduleObject: Record<string, any>;
  frontmatter: Record<string, any> | null;
  childEnvironment: Environment;
  guardDefinitions: SerializedGuardDefinition[];
}

/**
 * Handles variable creation, type inference, and environment merging for imports
 */
export class VariableImporter {
  private readonly bindingGuards: ImportBindingGuards;
  private readonly metadataMapParser: MetadataMapParser;
  private readonly exportManifestValidator: ModuleExportManifestValidator;
  private readonly guardExportChecker: GuardExportChecker;
  private readonly moduleExportSerializer: ModuleExportSerializer;
  private readonly importTypeRouter: ImportTypeRouter;
  private readonly variableFactoryOrchestrator: ImportVariableFactoryOrchestrator;
  private readonly capturedEnvRehydrator: CapturedEnvRehydrator;
  private readonly executableImportRehydrator: ExecutableImportRehydrator;
  private readonly policyImportHandler: PolicyImportHandler;
  private readonly namespaceSelectedImportHandler: NamespaceSelectedImportHandler;

  constructor(private objectResolver: ObjectReferenceResolver) {
    this.bindingGuards = new ImportBindingGuards();
    this.metadataMapParser = new MetadataMapParser();
    this.exportManifestValidator = new ModuleExportManifestValidator();
    this.guardExportChecker = new GuardExportChecker();
    this.moduleExportSerializer = new ModuleExportSerializer(this.objectResolver);
    this.importTypeRouter = new ImportTypeRouter();
    this.capturedEnvRehydrator = new CapturedEnvRehydrator();
    this.executableImportRehydrator = new ExecutableImportRehydrator(this.capturedEnvRehydrator);
    this.policyImportHandler = new PolicyImportHandler();
    this.namespaceSelectedImportHandler = new NamespaceSelectedImportHandler({
      bindingGuards: this.bindingGuards,
      createVariableFromValue: (name, value, importPath, originalName, options) =>
        this.createVariableFromValue(name, value, importPath, originalName, options),
      createNamespaceVariable: (
        alias,
        moduleObject,
        importPath,
        securityLabels,
        metadataMap,
        env,
        options
      ) =>
        this.createNamespaceVariable(
          alias,
          moduleObject,
          importPath,
          securityLabels,
          metadataMap,
          env,
          options
        ),
      getImportDisplayPath: (directive, fallback) => this.getImportDisplayPath(directive, fallback),
      policyImportHandler: this.policyImportHandler
    });
    this.variableFactoryOrchestrator = new ImportVariableFactoryOrchestrator({
      createExecutableFromImport: (name, value, source, metadata, securityLabels) =>
        this.createExecutableFromImport(name, value, source, metadata, securityLabels),
      hasComplexContent: value => this.hasComplexContent(value),
      unwrapArraySnapshots: (value, importPath) => this.unwrapArraySnapshots(value, importPath),
      inferVariableType: value => this.inferVariableType(value)
    });
  }
  
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
   * Serialize module environment for export (Map to object)
   * WHY: Maps don't serialize to JSON, so we need to convert to exportable format
   * IMPORTANT: Use the exact same serialization as processModuleExports to ensure compatibility
   */
  private serializeModuleEnv(moduleEnv: Map<string, Variable>, seen?: WeakSet<object>): any {
    // Track Maps currently being serialized to detect circular references.
    // captureModuleEnvironment() creates new Map instances each time, so identity
    // checks (===) miss circularity between Maps holding the same module's variables.
    const seenSet = seen ?? new WeakSet<object>();
    if (seenSet.has(moduleEnv)) {
      // Already serializing this (or an equivalent) Map — skip to prevent infinite recursion
      return undefined;
    }
    seenSet.add(moduleEnv);
    // Create a temporary childVars map and reuse processModuleExports logic
    // Skip module env serialization to prevent infinite recursion, but pass the
    // current target so we can detect circular references within the env.
    const tempResult = this.processModuleExports(moduleEnv, {}, true, null, undefined, undefined, moduleEnv, seenSet);
    return tempResult.moduleObject;
  }

  /**
   * Deserialize module environment after import (object to Map)
   * IMPORTANT: Reuse createVariableFromValue to ensure proper Variable reconstruction
   */
  deserializeModuleEnv(moduleEnv: any): Map<string, Variable> {
    return this.capturedEnvRehydrator.deserializeModuleEnv(
      moduleEnv,
      (name, varData, importPath, originalName) =>
        this.createVariableFromValue(name, varData, importPath, originalName)
    );
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
    const serializedMetadata = this.metadataMapParser.extractMetadataMap(moduleObject);
    const moduleObjectForImport = serializedMetadata
      ? Object.fromEntries(Object.entries(moduleObject).filter(([key]) => key !== '__metadata__'))
      : moduleObject;
    
    // Handle variable merging based on import type
    await this.handleImportType(
      directive,
      moduleObjectForImport,
      targetEnv,
      processingResult.childEnvironment,
      serializedMetadata,
      processingResult.guardDefinitions
    );
  }

  /**
   * Process module exports - either use explicit @data module or auto-generate
   */
  processModuleExports(
    childVars: Map<string, Variable>,
    parseResult: any,
    skipModuleEnvSerialization?: boolean,
    manifest?: ExportManifest | null,
    childEnv?: Environment,
    options?: { resolveStrings?: boolean },
    currentSerializationTarget?: Map<string, Variable>,
    _serializingEnvs?: WeakSet<object>
  ): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null; guards: SerializedGuardDefinition[] } {
    // Extract frontmatter if present
    const frontmatter = parseResult.frontmatter || null;
    const { explicitExports, guardNames } = this.exportManifestValidator.resolveExportPlan(childVars, manifest);
    this.guardExportChecker.validateGuardExports(guardNames, childEnv, manifest);
    
    // Export all top-level variables directly (except system variables)
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processModuleExports] childVars size: ${childVars.size}`);
      console.log(`[processModuleExports] childVars keys: ${Array.from(childVars.keys()).join(', ')}`);
    }

    const { moduleObject } = this.moduleExportSerializer.serialize({
      childVars,
      explicitExports,
      childEnv,
      options,
      skipModuleEnvSerialization,
      currentSerializationTarget,
      serializingEnvs: _serializingEnvs,
      isLegitimateVariableForExport: variable => this.isLegitimateVariableForExport(variable),
      serializeShadowEnvs: envs => this.serializeShadowEnvs(envs),
      serializeModuleEnv: (moduleEnv, seen) => this.serializeModuleEnv(moduleEnv, seen)
    });

    const guards = this.guardExportChecker.serializeGuardsByName(guardNames, childEnv);

    return {
      moduleObject,
      frontmatter,
      guards
    };
  }

  /**
   * Create a variable from an imported value, inferring the type
   */
  createVariableFromValue(
    name: string,
    value: any,
    importPath: string,
    originalName?: string,
    options?: {
      securityLabels?: DataLabel[];
      serializedMetadata?: ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined;
      env?: Environment;
    }
  ): Variable {
    return this.variableFactoryOrchestrator.createVariableFromValue(
      name,
      value,
      importPath,
      originalName,
      options
    );
  }

  private unwrapArraySnapshots(value: any, importPath: string, seen = new WeakSet<object>()): any {
    if (Array.isArray(value)) {
      return value.map(item => this.unwrapArraySnapshots(item, importPath, seen));
    }

    if (value && typeof value === 'object') {
      if (isNodeProxy(value)) {
        return value;
      }
      if (seen.has(value as object)) {
        return value;
      }
      seen.add(value as object);
      if ((value as any).__arraySnapshot) {
        const snapshot = value as { value: any[]; metadata?: Record<string, any>; isComplex?: boolean; name?: string };
        const source: VariableSource = {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        };
        const arrayMetadata = {
          ...(snapshot.metadata || {}),
          isImported: true,
          importPath,
          originalName: snapshot.name
        };
        const normalizedElements = Array.isArray(snapshot.value)
          ? snapshot.value.map(item => this.unwrapArraySnapshots(item, importPath, seen))
          : [];
        const arrayName = snapshot.name || 'imported_array';
        return createArrayVariable(arrayName, normalizedElements, snapshot.isComplex === true, source, arrayMetadata);
      }

      // Reconstruct __executable markers back to proper ExecutableVariables
      // This ensures isExecutableVariable() works on object properties
      if ((value as any).__executable) {
        const source: VariableSource = {
          directive: 'exe',
          syntax: 'braces',
          hasInterpolation: false,
          isMultiLine: false
        };
        return this.createExecutableFromImport(
          'property',
          value,
          source,
          { isImported: true, importPath }
        );
      }

      // Preserve StructuredValues as-is to keep their Symbol marker
      // StructuredValues have type, text, data, metadata properties and need the Symbol
      // for isStructuredValue() detection and proper field access unwrapping
      if (isStructuredValue(value)) {
        return value;
      }

      const result: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.unwrapArraySnapshots(entry, importPath, seen);
      }
      return result;
    }

    return value;
  }

  /**
   * Create a namespace variable for imports with aliased wildcards (e.g., * as @config)
   */
  createNamespaceVariable(
    alias: string,
    moduleObject: Record<string, any>,
    importPath: string,
    securityLabels?: DataLabel[],
    metadataMap?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined>,
    env?: Environment,
    options?: { strictFieldAccess?: boolean }
  ): Variable {
    const source: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };

    // Check if the namespace contains complex content (like executables)
    const isComplex = this.hasComplexContent(moduleObject);
    
    const snapshot = env?.getSecuritySnapshot?.();
    let snapshotDescriptor = snapshot
      ? makeSecurityDescriptor({
          labels: snapshot.labels,
          taint: snapshot.taint,
          sources: snapshot.sources,
          policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
        })
      : undefined;

    const metadata = VariableMetadataUtils.applySecurityMetadata(
      {
        isImported: true,
        importPath,
        definedAt: { line: 0, column: 0, filePath: importPath },
        namespaceMetadata: metadataMap
      },
      {
        labels: securityLabels,
        existingDescriptor: snapshotDescriptor
      }
    );
    const namespaceOptions = {
      metadata,
      internal: {
        isNamespace: true,
        strictFieldAccess: options?.strictFieldAccess === true
      }
    };

    return createObjectVariable(
      alias,
      moduleObject,
      isComplex, // Mark as complex if it contains AST nodes or executables
      source,
      namespaceOptions
    );
  }

  /**
   * Merge variables into the target environment based on import type
   */
  private async handleImportType(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment,
    metadataMap?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined>,
    guardDefinitions?: SerializedGuardDefinition[]
  ): Promise<void> {
    await this.importTypeRouter.route(directive, guardDefinitions, {
      handleNamespaceImport: () => this.namespaceSelectedImportHandler.handleNamespaceImport({
        directive,
        moduleObject,
        targetEnv,
        childEnv,
        metadataMap,
        guardDefinitions
      }),
      handleSelectedImport: () => this.namespaceSelectedImportHandler.handleSelectedImport({
        directive,
        moduleObject,
        targetEnv,
        childEnv,
        metadataMap,
        guardDefinitions
      }),
      registerSerializedGuards: definitions => targetEnv.registerSerializedGuards(definitions)
    });
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
    metadata: VariableMetadata,
    securityLabels?: DataLabel[]
  ): ExecutableVariable {
    return this.executableImportRehydrator.create({
      name,
      value,
      source,
      metadata,
      securityLabels,
      createVariableFromValue: (variableName, variableValue, importPath, originalName) =>
        this.createVariableFromValue(variableName, variableValue, importPath, originalName)
    });
  }

  /**
   * Check if a value contains complex AST nodes that need evaluation
   */
  private hasComplexContent(value: any, seen = new WeakSet<object>()): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    // Imported variables already hold evaluated content; do not treat them as complex
    if (this.isVariableLike(value)) {
      return false;
    }

    if (isNodeProxy(value)) {
      return false;
    }

    if (seen.has(value as object)) {
      return false;
    }
    seen.add(value as object);

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
      return value.some(item => this.hasComplexContent(item, seen));
    }
    
    // Recursively check object properties
    for (const prop of Object.values(value)) {
      if (this.hasComplexContent(prop, seen)) {
        return true;
      }
    }
    
    return false;
  }

  private isVariableLike(value: any): boolean {
    return value &&
      typeof value === 'object' &&
      typeof value.type === 'string' &&
      'name' in value &&
      'value' in value &&
      'source' in value &&
      'createdAt' in value &&
      'modifiedAt' in value;
  }

  /**
   * Infer variable type from value
   */
  private inferVariableType(value: any): VariableTypeDiscriminator {
    if (isStructuredValue(value)) {
      return 'structured';
    } else if (Array.isArray(value)) {
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
   * System variables (tracked via internal.isSystem) are excluded
   * to prevent namespace collisions when importing multiple modules with system variables like @fm.
   */
  private isLegitimateVariableForExport(variable: Variable): boolean {
    // System variables (like @fm) should not be exported
    const isSystem = variable.internal?.isSystem ?? false;

    if (isSystem) {
      return false;
    }
    
    // All user-created variables are exportable
    // This includes variables created by /var, /exe, /path directives
    return true;
  }
}
