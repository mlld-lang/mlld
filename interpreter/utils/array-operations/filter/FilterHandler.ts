import { FilterCondition } from '@core/types/primitives';
import { Environment } from '@interpreter/env/Environment';
import { FilterEvaluator } from './FilterEvaluator';

export class FilterHandler {
  private evaluator = new FilterEvaluator();

  async perform(
    items: any[],
    condition: FilterCondition,
    env: Environment
  ): Promise<any[]> {
    const results: any[] = [];

    for (const item of items) {
      // Pass full objects (including LoadContentResult) to evaluator
      const passed = await this.evaluator.evaluate(item, condition, env);
      if (passed) {
        results.push(item);  // Preserve the original object
      }
    }

    return results;
  }
}