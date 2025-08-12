import { FilterCondition } from '@core/types/primitives';
import { Environment } from '@interpreter/env/Environment';
import { DurationComparator } from './DurationComparator';
import { FieldAccessor } from './FieldAccessor';
import { isTimeDurationNode } from '@core/types/guards';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

export class FilterEvaluator {
  private durationComparator = new DurationComparator();
  private fieldAccessor = new FieldAccessor();

  async evaluate(
    item: any,  // Can be LoadContentResult or plain object
    condition: FilterCondition,
    env: Environment
  ): Promise<boolean> {
    // Extract field value (works with LoadContentResult or plain objects)
    const fieldValue = this.fieldAccessor.get(item, condition.field);

    // No operator = existence/truthiness check
    if (!condition.operator) {
      return this.isTruthy(fieldValue);
    }

    // Resolve comparison value (may be a variable reference)
    const compareValue = await this.resolveCompareValue(condition.value, env);

    // Special handling for time duration comparisons
    if (isTimeDurationNode(compareValue)) {
      return this.durationComparator.compare(
        fieldValue,
        condition.operator,
        compareValue
      );
    }

    // Standard comparisons
    return this.compareValues(fieldValue, condition.operator, compareValue);
  }

  private async resolveCompareValue(value: any, env: Environment): Promise<any> {
    // Check if it's a variable reference that needs resolution
    if (value?.type === 'VariableReference') {
      const variable = env.getVariable(value.identifier);
      if (!variable) {
        console.warn(`Variable not found in filter: ${value.identifier}`);
        return undefined;
      }
      return await extractVariableValue(variable, env);
    }

    // Pass through literals and TimeDuration nodes
    return value;
  }

  private compareValues(left: any, op: string, right: any): boolean {
    switch (op) {
      case '==':
        return this.equalityCompare(left, right);
      case '!=':
        return !this.equalityCompare(left, right);
      case '~':
        return this.containsCompare(left, right);
      case '>':
        return this.numericCompare(left, '>', right);
      case '>=':
        return this.numericCompare(left, '>=', right);
      case '<':
        return this.numericCompare(left, '<', right);
      case '<=':
        return this.numericCompare(left, '<=', right);
      default:
        console.warn(`Unknown filter operator: ${op}`);
        return false;
    }
  }

  private equalityCompare(left: any, right: any): boolean {
    // mlld-specific equality: "false" === false
    if (this.isFalsy(left) && this.isFalsy(right)) {
      return true;
    }
    // Use JavaScript loose equality
    return left == right;
  }

  private containsCompare(left: any, right: any): boolean {
    const leftStr = String(left);
    const rightStr = String(right);
    return leftStr.includes(rightStr);
  }

  private numericCompare(left: any, op: string, right: any): boolean {
    // Try numeric comparison first
    const leftNum = Number(left);
    const rightNum = Number(right);

    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      switch (op) {
        case '>': return leftNum > rightNum;
        case '>=': return leftNum >= rightNum;
        case '<': return leftNum < rightNum;
        case '<=': return leftNum <= rightNum;
      }
    }

    // Fall back to string comparison
    const leftStr = String(left);
    const rightStr = String(right);
    switch (op) {
      case '>': return leftStr > rightStr;
      case '>=': return leftStr >= rightStr;
      case '<': return leftStr < rightStr;
      case '<=': return leftStr <= rightStr;
    }

    return false;
  }

  private isTruthy(value: any): boolean {
    // mlld-specific truthiness
    if (value === undefined || value === null) return false;
    if (value === false || value === 'false') return false;
    if (value === '' || value === 0) return false;
    return true;
  }

  private isFalsy(value: any): boolean {
    return !this.isTruthy(value);
  }
}