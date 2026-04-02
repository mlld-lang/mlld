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
import type { ImportValueComplexityHelpers, ImportVariableFactoryRequest } from './types';

export class ObjectImportStrategy {
  constructor(private readonly complexityHelpers: ImportValueComplexityHelpers) {}

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
        ?? getCapturedModuleEnv(request.value)
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

  private normalizeToolCollectionCapturedModuleEnv(value: unknown): unknown {
    if (!value || typeof value !== 'object' || value instanceof Map) {
      return value;
    }

    return new Map(
      Object.entries(value as Record<string, unknown>).filter(([name]) => name !== '__metadata__')
    );
  }
}
