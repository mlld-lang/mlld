import type { DirectiveNode } from '@core/types';
import type { Variable, VariableSource, ExecutableVariable, VariableMetadata } from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
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
import { VariableImportUtilities } from './variable-importer/VariableImportUtilities';

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
  private readonly importUtilities: VariableImportUtilities;
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
    this.importUtilities = new VariableImportUtilities({
      createExecutableFromImport: (name, value, source, metadata, securityLabels) =>
        this.createExecutableFromImport(name, value, source, metadata, securityLabels)
    });
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
        this.importUtilities.createNamespaceVariable(
          alias,
          moduleObject,
          importPath,
          securityLabels,
          metadataMap,
          env,
          options
        ),
      getImportDisplayPath: (directive, fallback) => this.importUtilities.getImportDisplayPath(directive, fallback),
      policyImportHandler: this.policyImportHandler
    });
    this.variableFactoryOrchestrator = new ImportVariableFactoryOrchestrator({
      createExecutableFromImport: (name, value, source, metadata, securityLabels) =>
        this.createExecutableFromImport(name, value, source, metadata, securityLabels),
      hasComplexContent: value => this.importUtilities.hasComplexContent(value),
      unwrapArraySnapshots: (value, importPath) => this.importUtilities.unwrapArraySnapshots(value, importPath),
      inferVariableType: value => this.importUtilities.inferVariableType(value)
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
      isLegitimateVariableForExport: variable => this.importUtilities.isLegitimateVariableForExport(variable),
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
}
