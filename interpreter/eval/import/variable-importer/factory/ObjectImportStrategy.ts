import {
  attachToolCollectionMetadata,
  getToolCollectionMetadata,
  takeSerializedToolCollectionCapturedModuleEnv,
  takeSerializedToolCollectionMetadata
} from '@core/types/tools';
import { createObjectVariable, type VariableTypeDiscriminator } from '@core/types/variable';
import {
  getCapturedModuleEnv,
  getCapturedModuleOwnerEnv,
  stashCapturedModuleOwnerEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { isVariable } from '@interpreter/utils/variable-resolution';
import type { Environment } from '@interpreter/env/Environment';
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
      request.importPath,
      request.env
    );
    this.reconnectToolCollectionExecutables(normalizedObject, toolCollectionCapturedModuleEnv);
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
    importPath: string,
    env?: Environment
  ): unknown {
    if (!value || typeof value !== 'object' || value instanceof Map) {
      return value;
    }

    const rawCapturedEnv = value as Record<string, unknown>;
    const capturedModuleOwnerEnv = getCapturedModuleOwnerEnv(value) as Environment | undefined;
    const metadataMap =
      rawCapturedEnv.__metadata__
      && typeof rawCapturedEnv.__metadata__ === 'object'
      && !Array.isArray(rawCapturedEnv.__metadata__)
        ? rawCapturedEnv.__metadata__ as Record<string, ReturnType<typeof import('@core/types/variable').VariableMetadataUtils.serializeSecurityMetadata> | undefined>
        : {};

    const deserialized = new Map(
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
                  serializedMetadata: metadataMap[name],
                  ...(env ? { env } : {}),
                  ...(capturedModuleOwnerEnv ? { capturedModuleOwnerEnv } : {})
                }
              )
        ])
    );

    if (capturedModuleOwnerEnv) {
      stashCapturedModuleOwnerEnv(deserialized, capturedModuleOwnerEnv);
    }

    return deserialized;
  }

  private reconnectToolCollectionExecutables(
    normalizedObject: unknown,
    capturedModuleEnv: unknown
  ): void {
    if (!(capturedModuleEnv instanceof Map) || !isPlainObject(normalizedObject)) {
      return;
    }

    for (const [toolName, rawEntry] of Object.entries(normalizedObject)) {
      if (!isPlainObject(rawEntry) || !Object.prototype.hasOwnProperty.call(rawEntry, 'mlld')) {
        continue;
      }

      const executableVariable = this.resolveToolExecutableVariable(
        rawEntry.mlld,
        toolName,
        capturedModuleEnv
      );
      if (executableVariable) {
        if (
          isVariable(executableVariable)
          && getCapturedModuleEnv(executableVariable.internal) === undefined
          && getCapturedModuleEnv(executableVariable) === undefined
        ) {
          const internal = { ...(executableVariable.internal ?? {}) };
          sealCapturedModuleEnv(internal, capturedModuleEnv);
          executableVariable.internal = internal;
        }
        rawEntry.mlld = executableVariable;
      }
    }
  }

  private resolveToolExecutableVariable(
    mlldValue: unknown,
    toolName: string,
    capturedModuleEnv: Map<string, unknown>
  ): unknown {
    const candidateKeys = new Set<string>();

    const addCandidate = (value: unknown) => {
      if (typeof value !== 'string') {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      candidateKeys.add(trimmed);
      if (trimmed.startsWith('@') && trimmed.length > 1) {
        candidateKeys.add(trimmed.slice(1));
      }
    };

    if (typeof mlldValue === 'string') {
      addCandidate(mlldValue);
    } else if (isVariable(mlldValue)) {
      addCandidate(mlldValue.name);
    } else if (isPlainObject(mlldValue)) {
      addCandidate(mlldValue.name);
    }

    addCandidate(toolName);

    for (const key of candidateKeys) {
      const candidate = capturedModuleEnv.get(key);
      if (isVariable(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
