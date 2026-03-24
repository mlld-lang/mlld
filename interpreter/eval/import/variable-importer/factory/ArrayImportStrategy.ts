import { createArrayVariable } from '@core/types/variable';
import type { VariableTypeDiscriminator } from '@core/types/variable';
import type { ImportValueComplexityHelpers, ImportVariableFactoryRequest } from './types';

export class ArrayImportStrategy {
  constructor(
    private readonly complexityHelpers: Pick<ImportValueComplexityHelpers, 'hasComplexContent' | 'unwrapArraySnapshots'>
  ) {}

  create(
    request: ImportVariableFactoryRequest,
    inferredType: VariableTypeDiscriminator
  ) {
    if (inferredType !== 'array' || !Array.isArray(request.value)) {
      return undefined;
    }

    const normalizedArray = this.complexityHelpers.unwrapArraySnapshots(request.value, request.importPath);
    const isComplexArray = this.complexityHelpers.hasComplexContent(normalizedArray);
    if (process.env.MLLD_DEBUG_FIX === 'true') {
      console.error('[VariableImporter] create array variable', {
        name: request.name,
        importPath: request.importPath,
        isComplexArray,
        sample: normalizedArray.slice(0, 2)
      });
    }

    return createArrayVariable(
      request.name,
      normalizedArray,
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
