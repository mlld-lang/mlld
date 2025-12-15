import { Variable, ArrayVariable, createArrayVariable } from '@core/types/variable';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { ArrayData } from '../ArrayOperationsHandler';
import { wrapStructured } from '../../structured-value';

export class MetadataPreserver {
  preserveType(arrayData: ArrayData, transformed: any[]): any {
    switch (arrayData.type) {
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
