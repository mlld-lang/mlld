import { describe, expect, it } from 'vitest';
import { hasUnevaluatedDirectives, isFullyEvaluated } from './data-value-evaluator';

describe('data value evaluator array nodes', () => {
  it('accepts schema-style array items objects', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          person_name: { type: 'string' },
          task: { type: 'string' }
        },
        required: ['person_name', 'task']
      }
    } as any;

    expect(isFullyEvaluated(schema)).toBe(true);
    expect(hasUnevaluatedDirectives(schema)).toBe(false);
  });

  it('still walks mlld array item lists', () => {
    const arrayNode = {
      type: 'array',
      items: [
        { type: 'Text', content: 'ready' },
        { type: 'VariableReference', identifier: 'pending_value' }
      ]
    } as any;

    expect(isFullyEvaluated(arrayNode)).toBe(false);
    expect(hasUnevaluatedDirectives(arrayNode)).toBe(true);
  });
});
