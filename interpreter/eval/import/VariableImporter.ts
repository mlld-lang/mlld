import * as fs from 'fs';
import type { DirectiveNode } from '@core/types';
import type { Variable, VariableSource, VariableTypeDiscriminator, VariableMetadata } from '@core/types/variable';
import { 
  createImportedVariable, 
  createObjectVariable,
  createArrayVariable,
  createSimpleTextVariable,
  createPathVariable,
  createExecutableVariable,
  createTemplateVariable,
  createStructuredValueVariable,
  isExecutable,
  isExecutableVariable,
  getEffectiveType,
  VariableTypeGuards
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { isNodeProxy } from '@interpreter/utils/node-interop';
import type { Environment } from '../../env/Environment';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
import type { ShadowEnvironmentCapture } from '../../env/types/ShadowEnvironmentCapture';
import { ExportManifest } from './ExportManifest';
import { astLocationToSourceLocation } from '@core/types';
import type { SerializedGuardDefinition } from '../../guards';
import { generatePolicyGuards } from '@core/policy/guards';
import { ImportBindingGuards } from './variable-importer/ImportBindingGuards';
import { MetadataMapParser } from './variable-importer/MetadataMapParser';
import { ModuleExportManifestValidator } from './variable-importer/ModuleExportManifestValidator';
import { GuardExportChecker } from './variable-importer/GuardExportChecker';
import { ModuleExportSerializer } from './variable-importer/ModuleExportSerializer';

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

  constructor(private objectResolver: ObjectReferenceResolver) {
    this.bindingGuards = new ImportBindingGuards();
    this.metadataMapParser = new MetadataMapParser();
    this.exportManifestValidator = new ModuleExportManifestValidator();
    this.guardExportChecker = new GuardExportChecker();
    this.moduleExportSerializer = new ModuleExportSerializer(this.objectResolver);
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
    const source: VariableSource = {
      directive: 'var',
      syntax: Array.isArray(value) ? 'array' : 
              (value && typeof value === 'object') ? 'object' : 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    const deserialized = VariableMetadataUtils.deserializeSecurityMetadata(options?.serializedMetadata);
    const snapshot = options?.env?.getSecuritySnapshot?.();
    let snapshotDescriptor = snapshot
      ? makeSecurityDescriptor({
          labels: snapshot.labels,
          taint: snapshot.taint,
          sources: snapshot.sources,
          policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
        })
      : undefined;
    let combinedDescriptor = deserialized.security;
    if (snapshotDescriptor) {
      combinedDescriptor = combinedDescriptor
        ? mergeDescriptors(combinedDescriptor, snapshotDescriptor)
        : snapshotDescriptor;
    }
    const baseMetadata = {
      isImported: true,
      importPath,
      originalName: originalName !== name ? originalName : undefined,
      definedAt: { line: 0, column: 0, filePath: importPath },
      ...deserialized
    };
    const initialMetadata = VariableMetadataUtils.applySecurityMetadata(baseMetadata, {
      labels: options?.securityLabels,
      existingDescriptor: combinedDescriptor
    });
    const buildMetadata = (extra?: VariableMetadata): VariableMetadata =>
      VariableMetadataUtils.applySecurityMetadata(
        {
          ...initialMetadata,
          ...(extra || {})
        },
        {
          labels: options?.securityLabels,
          existingDescriptor: initialMetadata.security
        }
      );

    if (isStructuredValue(value)) {
      return createStructuredValueVariable(
        name,
        value,
        source,
        buildMetadata({
          isStructuredValue: true,
          structuredValueType: value.type
        })
      );
    }

    // Check if this is an executable export
    if (value && typeof value === 'object' && '__executable' in value && value.__executable) {
      return this.createExecutableFromImport(name, value, source, buildMetadata(), options?.securityLabels);
    }
    
    // Check if this is a template export
    if (value && typeof value === 'object' && (value as any).__template) {
      const templateSource: VariableSource = {
        directive: 'var',
        syntax: 'template',
        hasInterpolation: true,
        isMultiLine: true
      };
      const tmplMetadata = buildMetadata();
      const templateOptions = {
        metadata: tmplMetadata,
        internal: {
          templateAst: (value as any).templateAst
        }
      };
      return createTemplateVariable(
        name,
        (value as any).content,
        (value as any).parameters,
        (value as any).templateSyntax === 'tripleColon' ? 'tripleColon' : 'doubleColon',
        templateSource,
        templateOptions
      );
    }

    // Infer the variable type from the value
    const originalType = this.inferVariableType(value);

    // Preserve primitive types (no stringification) so math/boolean logic works in eval
    let processedValue = value;
    
    // For array types, create an ArrayVariable to preserve array behaviors
    if (originalType === 'array' && Array.isArray(processedValue)) {
      const isComplexArray = this.hasComplexContent(processedValue);
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[VariableImporter] create array variable', {
          name,
          importPath,
          isComplexArray,
          sample: processedValue.slice(0, 2)
        });
      }

      return createArrayVariable(
        name,
        processedValue,
        isComplexArray,
        source,
        buildMetadata({
          isImported: true,
          importPath,
          originalName: originalName !== name ? originalName : undefined
        })
      );
    }

    // For object types, create an ObjectVariable to preserve field access capability
    if (originalType === 'object') {
      const normalizedObject = this.unwrapArraySnapshots(processedValue, importPath);
      // Check if the object contains complex AST nodes that need evaluation
      const isComplex = this.hasComplexContent(normalizedObject);
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[VariableImporter] create object variable', {
          name,
          importPath,
          isComplex,
          keys: Object.keys(normalizedObject || {}).slice(0, 5),
          agentRosterPreview: normalizedObject && (normalizedObject as any).agent_roster
        });
        try {
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'VariableImporter',
              name,
              importPath,
              isComplex,
              keys: Object.keys(normalizedObject || {}).slice(0, 5),
              agentRosterType: normalizedObject && typeof (normalizedObject as any).agent_roster,
              agentRosterIsVariable: this.isVariableLike((normalizedObject as any).agent_roster),
              agentRosterIsArray: Array.isArray((normalizedObject as any).agent_roster)
            }) + '\n'
          );
        } catch {}
      }
      
      return createObjectVariable(
        name,
        normalizedObject,
        isComplex, // Mark as complex if it contains AST nodes
        source,
        buildMetadata({
          isImported: true,
          importPath,
          originalName: originalName !== name ? originalName : undefined
        })
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
      buildMetadata()
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
    if (directive.subtype === 'importPolicy') {
      await this.handleNamespaceImport(
        directive,
        moduleObject,
        targetEnv,
        childEnv,
        metadataMap,
        guardDefinitions
      );
    } else if (directive.subtype === 'importAll') {
      throw new MlldImportError(
        'Wildcard imports \'/import { * }\' are no longer supported. ' +
        'Use namespace imports instead: \'/import "file"\' or \'/import "file" as @name\'',
        directive.location,
        {
          suggestion: 'Change \'/import { * } from "file"\' to \'/import "file"\''
        }
      );
    } else if (directive.subtype === 'importNamespace') {
      await this.handleNamespaceImport(
        directive,
        moduleObject,
        targetEnv,
        childEnv,
        metadataMap,
        guardDefinitions
      );
    } else if (directive.subtype === 'importSelected') {
      if (guardDefinitions && guardDefinitions.length > 0) {
        targetEnv.registerSerializedGuards(guardDefinitions);
      }
      await this.handleSelectedImport(
        directive,
        moduleObject,
        targetEnv,
        childEnv,
        metadataMap,
        guardDefinitions
      );
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
    childEnv: Environment,
    metadataMap?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined>,
    guardDefinitions?: SerializedGuardDefinition[]
  ): Promise<void> {
    // For shorthand imports, namespace is stored as an array in values.namespace
    const namespaceNodes = directive.values?.namespace;
    const namespaceNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
    // Support both VariableReference (identifier) and Text (content) node types
    const alias = namespaceNode?.identifier ?? namespaceNode?.content ?? directive.values?.imports?.[0]?.alias;

    if (!alias) {
      throw new Error('Namespace import missing alias');
    }

    const importerFilePath = targetEnv.getCurrentFilePath();
    const aliasLocationNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
    const aliasLocation = aliasLocationNode?.location
      ? astLocationToSourceLocation(aliasLocationNode.location, importerFilePath)
      : astLocationToSourceLocation(directive.location, importerFilePath);

    // Namespace imports always create objects with exported properties
    const namespaceObject = moduleObject;
    
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    const importDisplay = this.getImportDisplayPath(directive, importPath);
    const bindingInfo = { source: importDisplay, location: aliasLocation };

    this.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, aliasLocation);

    // If the unwrapped object is a template export, create a template variable instead
    if (namespaceObject && typeof namespaceObject === 'object' && (namespaceObject as any).__template) {
      const templateVar = this.createVariableFromValue(alias, namespaceObject, importPath, undefined, {
        env: targetEnv
      });
      this.bindingGuards.setVariableWithImportBinding(targetEnv, alias, templateVar, bindingInfo);
      if (guardDefinitions && guardDefinitions.length > 0) {
        targetEnv.registerSerializedGuards(guardDefinitions);
      }
      if (directive.subtype === 'importPolicy') {
        const policyConfig = this.resolveImportedPolicyConfig(namespaceObject, alias);
        targetEnv.recordPolicyConfig(alias, policyConfig);
        const guards = generatePolicyGuards(policyConfig, alias);
        const registry = targetEnv.getGuardRegistry();
        for (const guard of guards) {
          registry.registerPolicyGuard(guard);
        }
      }
      return;
    }

    const allowMissingNamespaceFields = importDisplay === '@payload' || importDisplay === '@state';
    // Explicit export lists enforce strict namespace field access.
    const strictNamespaceFieldAccess =
      !allowMissingNamespaceFields &&
      Boolean(childEnv.getExportManifest?.()?.hasEntries?.());
    // Create namespace variable with the (potentially unwrapped) object
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    const namespaceVar = this.createNamespaceVariable(
      alias,
      namespaceObject,
      importPath,
      securityLabels,
      metadataMap,
      targetEnv,
      { strictFieldAccess: strictNamespaceFieldAccess }
    );
    this.bindingGuards.setVariableWithImportBinding(targetEnv, alias, namespaceVar, bindingInfo);
    if (guardDefinitions && guardDefinitions.length > 0) {
      targetEnv.registerSerializedGuards(guardDefinitions);
    }
    if (directive.subtype === 'importPolicy') {
      const policyConfig = this.resolveImportedPolicyConfig(namespaceObject, alias);
      targetEnv.recordPolicyConfig(alias, policyConfig);
      const guards = generatePolicyGuards(policyConfig, alias);
      const registry = targetEnv.getGuardRegistry();
      for (const guard of guards) {
        registry.registerPolicyGuard(guard);
      }
    }
  }

  /**
   * Handle selected imports
   */
  private async handleSelectedImport(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment,
    metadataMap?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined>,
    guardDefinitions?: readonly SerializedGuardDefinition[]
  ): Promise<void> {
    const imports = directive.values?.imports || [];
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    const importDisplay = this.getImportDisplayPath(directive, importPath);
    const importerFilePath = targetEnv.getCurrentFilePath();
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    const importedGuards = new Set(
      (guardDefinitions ?? [])
        .map(definition => definition?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    );

    // @payload and @state are dynamic modules where fields are optional CLI arguments.
    // Missing fields should default to null rather than throwing an error.
    const allowMissingImports = importDisplay === '@payload' || importDisplay === '@state';

    for (const importItem of imports) {
      const importName = importItem.identifier;
      const alias = importItem.alias || importName;

      if (!(importName in moduleObject)) {
        if (importedGuards.has(importName)) {
          continue;
        }
        if (allowMissingImports) {
          // Create a null variable for missing imports from @payload/@state
          const bindingLocation = importItem?.location
            ? astLocationToSourceLocation(importItem.location, importerFilePath)
            : astLocationToSourceLocation(directive.location, importerFilePath);
          const bindingInfo = { source: importDisplay, location: bindingLocation };

          this.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, bindingLocation);

          const variable = this.createVariableFromValue(alias, null, importPath, importName, {
            securityLabels,
            env: targetEnv
          });

          this.bindingGuards.setVariableWithImportBinding(targetEnv, alias, variable, bindingInfo);
          continue;
        }
        throw new Error(`Import '${importName}' not found in module`);
      }

      const bindingLocation = importItem?.location
        ? astLocationToSourceLocation(importItem.location, importerFilePath)
        : astLocationToSourceLocation(directive.location, importerFilePath);
      const bindingInfo = { source: importDisplay, location: bindingLocation };

      this.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, bindingLocation);

      const importedValue = moduleObject[importName];
      const serializedMetadata = metadataMap ? metadataMap[importName] : undefined;
      const variable = this.createVariableFromValue(alias, importedValue, importPath, importName, {
        securityLabels,
        serializedMetadata,
        env: targetEnv
      });

      this.bindingGuards.setVariableWithImportBinding(targetEnv, alias, variable, bindingInfo);
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

  private resolveImportedPolicyConfig(namespaceObject: unknown, alias: string): unknown {
    if (!namespaceObject || typeof namespaceObject !== 'object' || Array.isArray(namespaceObject)) {
      return namespaceObject;
    }
    const candidate = namespaceObject as Record<string, unknown>;
    if (alias && Object.prototype.hasOwnProperty.call(candidate, alias)) {
      return candidate[alias];
    }
    if (candidate.config !== undefined && candidate.config !== null) {
      return candidate.config;
    }
    return namespaceObject;
  }

  /**
   * Create an executable variable from import metadata
   */
  private createExecutableFromImport(
    name: string,
    value: any,
    source: VariableSource,
    metadata: any,
    securityLabels?: DataLabel[]
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
    let originalInternal = value.internal || value.metadata || {};

    // Deserialize shadow environments if present
    if (originalInternal.capturedShadowEnvs) {
      originalInternal = {
        ...originalInternal,
        capturedShadowEnvs: this.deserializeShadowEnvs(originalInternal.capturedShadowEnvs)
      };
    }

    // Deserialize module environment if present
    if (originalInternal.capturedModuleEnv) {
      const deserializedEnv = this.deserializeModuleEnv(originalInternal.capturedModuleEnv);

      // IMPORTANT: Each executable in the module env needs to have access to the full env
      // This allows command-refs to find their siblings.
      // BUT: Only set capturedModuleEnv if the exe doesn't already have one from a prior import.
      // Imported exes preserve their original scope chain.
      for (const [_, variable] of deserializedEnv) {
        if (variable.type === 'executable') {
          const existingEnv = variable.internal?.capturedModuleEnv;
          if (!existingEnv || !(existingEnv instanceof Map)) {
            variable.internal = {
              ...(variable.internal ?? {}),
              capturedModuleEnv: deserializedEnv
            };
          }
        }
      }

      originalInternal = {
        ...originalInternal,
        capturedModuleEnv: deserializedEnv
      };
    }
    
    const enhancedMetadata = {
      ...metadata,
      isImported: true,
      importPath: metadata.importPath
    };

    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(enhancedMetadata, {
      labels: securityLabels,
      existingDescriptor: enhancedMetadata.security
    });

    const finalInternal = {
      ...(originalInternal as Record<string, unknown>),
      executableDef
    };

    const execVariable = createExecutableVariable(
      name,
      'command', // Default type - the real type is in executableDef
      '', // Empty template - the real template is in executableDef
      paramNames,
      undefined, // No language here - it's in executableDef
      source,
      {
        metadata: finalMetadata,
        internal: finalInternal
      }
    );
    
    return execVariable;
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
