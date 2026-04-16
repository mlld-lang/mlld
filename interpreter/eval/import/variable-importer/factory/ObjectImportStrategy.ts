import {
  attachToolCollectionMetadata,
  getToolCollectionMetadata,
  takeSerializedToolCollectionCapturedModuleEnv,
  takeSerializedToolCollectionMetadata
} from '@core/types/tools';
import { createObjectVariable, type VariableTypeDiscriminator } from '@core/types/variable';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { isVariable } from '@interpreter/utils/variable-resolution';
import type {
  ImportNestedVariableFactory,
  ImportValueComplexityHelpers,
  ImportVariableFactoryRequest
} from './types';

export class ObjectImportStrategy {
  constructor(
    private readonly complexityHelpers: ImportValueComplexityHelpers,
    private readonly nestedVariableFactory: ImportNestedVariableFactory
  ) {}

  create(
    request: ImportVariableFactoryRequest,
    inferredType: VariableTypeDiscriminator
  ) {
    if (inferredType !== 'object') {
      return undefined;
    }

    const normalizedObject = this.complexityHelpers.unwrapArraySnapshots(request.value, request.importPath);
    const toolCollectionCapturedModuleEnv = this.normalizeToolCollectionCapturedModuleEnv(
      takeSerializedToolCollectionCapturedModuleEnv(normalizedObject)
        ?? getCapturedModuleEnv(request.value),
      request.importPath
    );
    const toolCollectionMetadata =
      takeSerializedToolCollectionMetadata(normalizedObject)
      ?? getToolCollectionMetadata(request.value);
    if (toolCollectionMetadata) {
      attachToolCollectionMetadata(normalizedObject, toolCollectionMetadata);
      if (toolCollectionCapturedModuleEnv !== undefined) {
        sealCapturedModuleEnv(normalizedObject, toolCollectionCapturedModuleEnv);
      }
    }
    const isComplex = this.complexityHelpers.hasComplexContent(normalizedObject);

    const isNamespace = normalizedObject && (normalizedObject as any).__namespace === true;
    if (isNamespace) {
      delete (normalizedObject as any).__namespace;
    }

    const variable = createObjectVariable(
      request.name,
      normalizedObject,
      isComplex,
      request.metadata.source,
      {
        metadata: request.metadata.buildMetadata({
          isImported: true,
          importPath: request.importPath,
          originalName: request.originalName !== request.name ? request.originalName : undefined
        }),
        ...(toolCollectionMetadata?.auth
          ? {
              internal: {
                toolCollection: normalizedObject,
                isToolsCollection: true,
                ...(toolCollectionCapturedModuleEnv !== undefined
                  ? { capturedModuleEnv: toolCollectionCapturedModuleEnv }
                  : {})
              }
            }
          : {})
      }
    );

    if (isNamespace) {
      variable.internal = { ...(variable.internal ?? {}), isNamespace: true };
    }

    return variable;
  }

  private normalizeToolCollectionCapturedModuleEnv(
    value: unknown,
    importPath: string
  ): unknown {
    if (!value || typeof value !== 'object' || value instanceof Map) {
      return value;
    }

    const rawCapturedEnv = value as Record<string, unknown>;
    const metadataMap =
      rawCapturedEnv.__metadata__
      && typeof rawCapturedEnv.__metadata__ === 'object'
      && !Array.isArray(rawCapturedEnv.__metadata__)
        ? rawCapturedEnv.__metadata__ as Record<string, ReturnType<typeof import('@core/types/variable').VariableMetadataUtils.serializeSecurityMetadata> | undefined>
        : {};

    return new Map(
      Object.entries(rawCapturedEnv)
        .filter(([name]) => name !== '__metadata__')
        .map(([name, entry]) => [
          name,
          isVariable(entry)
            ? entry
            : this.nestedVariableFactory.createVariableFromValue(
                name,
                entry,
                importPath,
                name,
                {
                  serializedMetadata: metadataMap[name]
                }
              )
        ])
    );
  }
}
