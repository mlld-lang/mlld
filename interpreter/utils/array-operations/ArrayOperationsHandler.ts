import { Environment } from '@interpreter/env/Environment';
import { FieldAccessNode, ArraySliceNode, ArrayFilterNode } from '@core/types/primitives';
import { SliceHandler } from './slice/SliceHandler';
import { FilterHandler } from './filter/FilterHandler';
import { MetadataPreserver } from './metadata/MetadataPreserver';
import { isLoadContentResultArray } from '@core/types/load-content';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { asData, isStructuredValue } from '../structured-value';

export class ArrayOperationsHandler {
  private slice = new SliceHandler();
  private filter = new FilterHandler();
  private preserver = new MetadataPreserver();

  async handle(
    value: any,
    field: FieldAccessNode,
    env: Environment
  ): Promise<any> {
    // Extract array data while preserving LoadContentResult objects
    const arrayData = this.extractArrayData(value);
    if (!arrayData) {
      console.warn(`Array operation ${field.type} on non-array value`);
      return field.type === 'arraySlice' ? [] : value;
    }

    switch (field.type) {
      case 'arraySlice':
        return this.handleSlice(arrayData, field as ArraySliceNode);

      case 'arrayFilter':
        return await this.handleFilter(arrayData, field as ArrayFilterNode, env);

      default:
        return null;
    }
  }

  private handleSlice(arrayData: ArrayData, node: ArraySliceNode): any {
    const sliced = this.slice.perform(arrayData.items, node.start, node.end);
    return this.preserver.preserveType(arrayData, sliced);
  }

  private async handleFilter(
    arrayData: ArrayData,
    node: ArrayFilterNode,
    env: Environment
  ): Promise<any> {
    // Pass full objects to filter, not unwrapped content
    const filtered = await this.filter.perform(
      arrayData.items,
      node.condition,
      env
    );
    return this.preserver.preserveType(arrayData, filtered);
  }

  private extractArrayData(value: any): ArrayData | null {
    // LoadContentResultArray - keep objects intact
    if (isLoadContentResultArray(value)) {
      return {
        type: 'load-content-result',
        items: value,  // Array of LoadContentResult objects
        original: value
      };
    }

    // Variable containing array
    if (isVariable(value) && value.type === 'array') {
      return {
        type: 'array-variable',
        items: value.value,
        original: value
      };
    }

    if (isStructuredValue(value)) {
      const data = asData(value);
      if (Array.isArray(data)) {
        return {
          type: 'structured-value',
          items: data,
          original: value
        };
      }
    }

    // Plain JavaScript array
    if (Array.isArray(value)) {
      return {
        type: 'plain-array',
        items: value,
        original: value
      };
    }

    // Handle normalized AST arrays
    if (value?.type === 'array' && value.items) {
      return {
        type: 'ast-array',
        items: value.items,
        original: value
      };
    }

    return null;
  }
}

export interface ArrayData {
  type: 'load-content-result' | 'array-variable' | 'plain-array' | 'ast-array' | 'structured-value';
  items: any[];  // Can be LoadContentResult[] or plain values
  original: any;
}
