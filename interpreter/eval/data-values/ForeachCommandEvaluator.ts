import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';

/**
 * Handles evaluation of foreach command expressions.
 *
 * Delegates directly to the core foreach evaluator to ensure consistent
 * semantics across all execution paths.
 */
export class ForeachCommandEvaluator {
  /**
   * Checks if this evaluator can handle the given data value.
   */
  canHandle(value: DataValue): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'type' in value &&
      (value.type === 'foreach' || value.type === 'foreach-command')
    );
  }

  /**
   * Evaluates a foreach command expression.
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    if (!this.canHandle(value)) {
      throw new Error(`ForeachCommandEvaluator cannot handle value type: ${typeof value}`);
    }
    return this.evaluateForeachCommand(value, env);
  }

  /**
   * Delegates to the core foreach evaluator.
   */
  async evaluateForeachCommand(foreachExpr: any, env: Environment): Promise<any> {
    const { evaluateForeachCommand } = await import('../foreach');
    return evaluateForeachCommand(foreachExpr, env);
  }

  /**
   * Delegates validation to the core foreach validator.
   */
  async validateForeachExpression(
    foreachExpr: any,
    env: Environment
  ): Promise<{ valid: boolean; errors: string[] }> {
    const { validateForeachExpression } = await import('../foreach');
    return validateForeachExpression(foreachExpr, env);
  }
}
