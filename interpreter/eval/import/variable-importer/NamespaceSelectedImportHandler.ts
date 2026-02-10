import type { DirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { DataLabel } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import type { SerializedGuardDefinition } from '@interpreter/guards';
import { ImportBindingGuards } from './ImportBindingGuards';
import { PolicyImportHandler } from './PolicyImportHandler';

type SerializedSecurityMetadata =
  | ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>
  | undefined;
type SerializedMetadataMap = Record<string, SerializedSecurityMetadata>;

type ImportVariableFactory = (
  name: string,
  value: any,
  importPath: string,
  originalName?: string,
  options?: {
    securityLabels?: DataLabel[];
    serializedMetadata?: SerializedSecurityMetadata;
    env?: Environment;
  }
) => Variable;

type NamespaceVariableFactory = (
  alias: string,
  moduleObject: Record<string, any>,
  importPath: string,
  securityLabels?: DataLabel[],
  metadataMap?: SerializedMetadataMap,
  env?: Environment,
  options?: { strictFieldAccess?: boolean }
) => Variable;

export interface NamespaceImportRequest {
  directive: DirectiveNode;
  moduleObject: Record<string, any>;
  targetEnv: Environment;
  childEnv: Environment;
  metadataMap?: SerializedMetadataMap;
  guardDefinitions?: readonly SerializedGuardDefinition[];
}

export interface SelectedImportRequest {
  directive: DirectiveNode;
  moduleObject: Record<string, any>;
  targetEnv: Environment;
  childEnv: Environment;
  metadataMap?: SerializedMetadataMap;
  guardDefinitions?: readonly SerializedGuardDefinition[];
}

export interface NamespaceSelectedImportHandlerDependencies {
  bindingGuards: ImportBindingGuards;
  createVariableFromValue: ImportVariableFactory;
  createNamespaceVariable: NamespaceVariableFactory;
  getImportDisplayPath: (directive: DirectiveNode, fallback: string) => string;
  policyImportHandler: PolicyImportHandler;
}

export class NamespaceSelectedImportHandler {
  constructor(private readonly dependencies: NamespaceSelectedImportHandlerDependencies) {}

  async handleNamespaceImport(request: NamespaceImportRequest): Promise<void> {
    const { directive, moduleObject, targetEnv, childEnv, metadataMap, guardDefinitions } = request;

    const namespaceNodes = directive.values?.namespace;
    const namespaceNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
    const alias = namespaceNode?.identifier ?? namespaceNode?.content ?? directive.values?.imports?.[0]?.alias;

    if (!alias) {
      throw new Error('Namespace import missing alias');
    }

    const importerFilePath = targetEnv.getCurrentFilePath();
    const aliasLocation = namespaceNode?.location
      ? astLocationToSourceLocation(namespaceNode.location, importerFilePath)
      : astLocationToSourceLocation(directive.location, importerFilePath);

    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    const importDisplay = this.dependencies.getImportDisplayPath(directive, importPath);
    const bindingInfo = { source: importDisplay, location: aliasLocation };

    this.dependencies.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, aliasLocation);

    if (moduleObject && typeof moduleObject === 'object' && (moduleObject as any).__template) {
      const templateVar = this.dependencies.createVariableFromValue(alias, moduleObject, importPath, undefined, {
        env: targetEnv
      });
      this.dependencies.bindingGuards.setVariableWithImportBinding(targetEnv, alias, templateVar, bindingInfo);
      this.registerSerializedGuards(targetEnv, guardDefinitions);
      this.dependencies.policyImportHandler.applyNamespacePolicyImport(directive, moduleObject, alias, targetEnv);
      return;
    }

    const allowMissingNamespaceFields = importDisplay === '@payload' || importDisplay === '@state';
    const strictNamespaceFieldAccess =
      !allowMissingNamespaceFields &&
      Boolean(childEnv.getExportManifest?.()?.hasEntries?.());
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;

    const namespaceVar = this.dependencies.createNamespaceVariable(
      alias,
      moduleObject,
      importPath,
      securityLabels,
      metadataMap,
      targetEnv,
      { strictFieldAccess: strictNamespaceFieldAccess }
    );

    this.dependencies.bindingGuards.setVariableWithImportBinding(targetEnv, alias, namespaceVar, bindingInfo);
    this.registerSerializedGuards(targetEnv, guardDefinitions);
    this.dependencies.policyImportHandler.applyNamespacePolicyImport(directive, moduleObject, alias, targetEnv);
  }

  async handleSelectedImport(request: SelectedImportRequest): Promise<void> {
    const { directive, moduleObject, targetEnv, childEnv, metadataMap, guardDefinitions } = request;
    const imports = directive.values?.imports || [];
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    const importDisplay = this.dependencies.getImportDisplayPath(directive, importPath);
    const importerFilePath = targetEnv.getCurrentFilePath();
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    const importedGuards = new Set(
      (guardDefinitions ?? [])
        .map(definition => definition?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    );

    const allowMissingImports = importDisplay === '@payload' || importDisplay === '@state';

    for (const importItem of imports) {
      const importName = importItem.identifier;
      const alias = importItem.alias || importName;

      if (!(importName in moduleObject)) {
        if (importedGuards.has(importName)) {
          continue;
        }
        if (allowMissingImports) {
          const bindingLocation = importItem?.location
            ? astLocationToSourceLocation(importItem.location, importerFilePath)
            : astLocationToSourceLocation(directive.location, importerFilePath);
          const bindingInfo = { source: importDisplay, location: bindingLocation };

          this.dependencies.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, bindingLocation);

          const variable = this.dependencies.createVariableFromValue(alias, null, importPath, importName, {
            securityLabels,
            env: targetEnv
          });

          this.dependencies.bindingGuards.setVariableWithImportBinding(targetEnv, alias, variable, bindingInfo);
          continue;
        }
        throw new Error(`Import '${importName}' not found in module`);
      }

      const bindingLocation = importItem?.location
        ? astLocationToSourceLocation(importItem.location, importerFilePath)
        : astLocationToSourceLocation(directive.location, importerFilePath);
      const bindingInfo = { source: importDisplay, location: bindingLocation };

      this.dependencies.bindingGuards.ensureImportBindingAvailable(targetEnv, alias, importDisplay, bindingLocation);

      const importedValue = moduleObject[importName];
      const serializedMetadata = metadataMap ? metadataMap[importName] : undefined;
      const variable = this.dependencies.createVariableFromValue(alias, importedValue, importPath, importName, {
        securityLabels,
        serializedMetadata,
        env: targetEnv
      });

      this.dependencies.bindingGuards.setVariableWithImportBinding(targetEnv, alias, variable, bindingInfo);
    }
  }

  private registerSerializedGuards(
    targetEnv: Environment,
    guardDefinitions?: readonly SerializedGuardDefinition[]
  ): void {
    if (guardDefinitions && guardDefinitions.length > 0) {
      targetEnv.registerSerializedGuards([...guardDefinitions]);
    }
  }
}
