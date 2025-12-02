import { Environment } from '@interpreter/env/Environment';
import { FieldAccessNode, ArraySliceNode, ArrayFilterNode, SliceIndex } from '@core/types/primitives';
import { isVariableReferenceNode } from '@core/types/guards';
import { SliceHandler } from './slice/SliceHandler';
import { FilterHandler } from './filter/FilterHandler';
import { MetadataPreserver } from './metadata/MetadataPreserver';
import { isLoadContentResultArray } from '@core/types/load-content';
import { isVariable, resolveValue, ResolutionContext } from '@interpreter/utils/variable-resolution';
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
        return await this.handleSlice(arrayData, field as ArraySliceNode, env);

      case 'arrayFilter':
        return await this.handleFilter(arrayData, field as ArrayFilterNode, env);

      default:
        return null;
    }
  }

  private async handleSlice(arrayData: ArrayData, node: ArraySliceNode, env: Environment): Promise<any> {
    // Resolve variable references in slice indices
    const start = await this.resolveSliceIndex(node.start, env);
    const end = await this.resolveSliceIndex(node.end, env);

    const sliced = this.slice.perform(arrayData.items, start, end);
    return this.preserver.preserveType(arrayData, sliced);
  }

  private async resolveSliceIndex(index: SliceIndex | null, env: Environment): Promise<number | null> {
    if (index === null || index === undefined) {
      return null;
    }

    if (typeof index === 'number') {
      return index;
    }

    // Handle variable reference
    if (isVariableReferenceNode(index)) {
      const variable = env.getVariable(index.identifier);
      if (!variable) {
        throw new Error(`Variable not found for slice index: @${index.identifier}`);
      }

      const resolved = await resolveValue(variable, env, ResolutionContext.StringInterpolation);
      const value = isVariable(resolved) ? resolved.value : resolved;

      if (typeof value !== 'number') {
        throw new Error(`Slice index must resolve to a number, got ${typeof value} from @${index.identifier}`);
      }

      return value;
    }

    // Unknown index type
    throw new Error(`Invalid slice index type: ${typeof index}`);
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
