import * as fs from 'fs';
import {
  attachToolCollectionMetadata,
  takeSerializedToolCollectionCapturedModuleEnv,
  takeSerializedToolCollectionMetadata
} from '@core/types/tools';
import { createObjectVariable, type VariableTypeDiscriminator } from '@core/types/variable';
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
    );
    const toolCollectionMetadata = takeSerializedToolCollectionMetadata(normalizedObject);
    if (toolCollectionMetadata) {
      attachToolCollectionMetadata(normalizedObject, toolCollectionMetadata);
    }
    const isComplex = this.complexityHelpers.hasComplexContent(normalizedObject);
    if (process.env.MLLD_DEBUG_FIX === 'true') {
      console.error('[VariableImporter] create object variable', {
        name: request.name,
        importPath: request.importPath,
        isComplex,
        keys: Object.keys(normalizedObject || {}).slice(0, 5),
        agentRosterPreview: normalizedObject && (normalizedObject as any).agent_roster
      });
      try {
        fs.appendFileSync(
          '/tmp/mlld-debug.log',
          JSON.stringify({
            source: 'VariableImporter',
            name: request.name,
            importPath: request.importPath,
            isComplex,
            keys: Object.keys(normalizedObject || {}).slice(0, 5),
            agentRosterType: normalizedObject && typeof (normalizedObject as any).agent_roster,
            agentRosterIsVariable: this.isVariableLike((normalizedObject as any).agent_roster),
            agentRosterIsArray: Array.isArray((normalizedObject as any).agent_roster)
          }) + '\n'
        );
      } catch {}
    }

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

  private normalizeToolCollectionCapturedModuleEnv(value: unknown): unknown {
    if (!value || typeof value !== 'object' || value instanceof Map) {
      return value;
    }

    return new Map(
      Object.entries(value as Record<string, unknown>).filter(([name]) => name !== '__metadata__')
    );
  }
}
