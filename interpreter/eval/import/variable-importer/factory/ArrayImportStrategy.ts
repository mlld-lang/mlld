import { createArrayVariable } from '@core/types/variable';
import type { VariableTypeDiscriminator } from '@core/types/variable';
import type { ImportValueComplexityHelpers, ImportVariableFactoryRequest } from './types';

export class ArrayImportStrategy {
  constructor(private readonly complexityHelpers: Pick<ImportValueComplexityHelpers, 'hasComplexContent'>) {}

  create(
    request: ImportVariableFactoryRequest,
    inferredType: VariableTypeDiscriminator
  ) {
    if (inferredType !== 'array' || !Array.isArray(request.value)) {
      return undefined;
    }

    const isComplexArray = this.complexityHelpers.hasComplexContent(request.value);
    if (process.env.MLLD_DEBUG_FIX === 'true') {
      console.error('[VariableImporter] create array variable', {
        name: request.name,
        importPath: request.importPath,
        isComplexArray,
        sample: request.value.slice(0, 2)
      });
    }

    return createArrayVariable(
      request.name,
      request.value,
      isComplexArray,
      request.metadata.source,
      request.metadata.buildMetadata({
        isImported: true,
        importPath: request.importPath,
        originalName: request.originalName !== request.name ? request.originalName : undefined
      })
    );
  }
}
