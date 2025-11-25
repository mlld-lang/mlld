import { isLoadContentResultArray, LoadContentResultArray } from '@core/types/load-content';
import { Variable, ArrayVariable, createArrayVariable } from '@core/types/variable';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { ArrayData } from '../ArrayOperationsHandler';
import { wrapStructured } from '../../structured-value';

export class MetadataPreserver {
  preserveType(arrayData: ArrayData, transformed: any[]): any {
    switch (arrayData.type) {
      case 'load-content-result':
        return this.preserveLoadContentResultArray(
          arrayData.original as LoadContentResultArray,
          transformed
        );

      case 'array-variable':
        return this.preserveArrayVariable(
          arrayData.original as ArrayVariable,
          transformed
        );

      case 'ast-array':
        return {
          type: 'array',
          items: transformed
        };

      case 'structured-value': {
        const wrapper = arrayData.original;
        return wrapStructured(
          transformed,
          (wrapper && wrapper.type) || 'array',
          JSON.stringify(transformed),
          wrapper?.ctx,
          wrapper?.internal
        );
      }

      case 'plain-array':
      default:
        return transformed;
    }
  }

  private preserveLoadContentResultArray(
    original: LoadContentResultArray,
    transformed: any[]
  ): LoadContentResultArray {
    // Create new array with preserved special behaviors
    const result = Object.assign(transformed, {
      // Custom toString for concatenation in templates
      toString: () => transformed.map(f => f.content).join('\n\n'),
      // Custom content getter for template interpolation
      get content() {
        return transformed.map(f => f.content).join('\n\n');
      }
    });

    // Preserve Variable metadata if present
    if ((original as any).__variable) {
      (result as any).__variable = (original as any).__variable;
    }

    return result as LoadContentResultArray;
  }

  private preserveArrayVariable(
    original: ArrayVariable,
    transformed: any[]
  ): ArrayVariable {
    return createArrayVariable(
      original.name,
      transformed,
      original.isComplex || false,
      original.source,
      {
        ctx: { ...original.ctx },
        internal: { ...original.internal, transformedBy: 'array-operation' }
      }
    );
  }
}
