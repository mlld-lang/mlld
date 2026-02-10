import * as fs from 'fs';
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

    return createObjectVariable(
      request.name,
      normalizedObject,
      isComplex,
      request.metadata.source,
      request.metadata.buildMetadata({
        isImported: true,
        importPath: request.importPath,
        originalName: request.originalName !== request.name ? request.originalName : undefined
      })
    );
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
}
