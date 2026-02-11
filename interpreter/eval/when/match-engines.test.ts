import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  evaluateFirstMatch,
  evaluateAnyMatch,
  validateNonePlacement,
  type WhenMatcherRuntime
} from './match-engines';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createRuntime(): WhenMatcherRuntime {
  return {
    async evaluateCondition(condition, env): Promise<boolean> {
      const first = condition[0] as any;
      if (!first) {
        return false;
      }
      if (first.type === 'Text') {
        return first.content === 'true';
      }
      if (first.type === 'Literal' && first.valueType === 'none') {
        return false;
      }
      return Boolean(first.value);
    },
    async evaluateActionSequence(actionNodes, env) {
      const first = actionNodes[0] as any;
      return { value: first?.content ?? '', env };
    },
    async compareValues(expressionValue, conditionValue) {
      return expressionValue === conditionValue;
    },
    async evaluateNode(nodes, env) {
      const first = nodes[0] as any;
      if (!first) {
        return { value: '', env };
      }
      if (first.type === 'Text') {
        return { value: first.content, env };
      }
      return { value: first.value ?? first.valueType ?? '', env };
    },
    isExeReturnControl: () => false
  };
}

describe('when match engines', () => {
  it('keeps first-match branch precedence over none fallback', async () => {
    const env = createEnvironment();
    const runtime = createRuntime();

    const result = await evaluateFirstMatch(
      [
        {
          condition: [{ type: 'Text', nodeId: 'cond-true', content: 'true' } as any],
          action: [{ type: 'Text', nodeId: 'action-first', content: 'first' } as any]
        },
        {
          condition: [{ type: 'Literal', nodeId: 'cond-none', value: 'none', valueType: 'none' } as any],
          action: [{ type: 'Text', nodeId: 'action-none', content: 'none' } as any]
        }
      ] as any,
      env,
      runtime
    );

    expect(result.value).toBe('first');
  });

  it('keeps expression matching precedence stable before none fallback', async () => {
    const env = createEnvironment();
    const runtime = createRuntime();

    const result = await evaluateFirstMatch(
      [
        {
          condition: [{ type: 'Text', nodeId: 'cond-alpha', content: 'alpha' } as any],
          action: [{ type: 'Text', nodeId: 'action-alpha', content: 'alpha-hit' } as any]
        },
        {
          condition: [{ type: 'Text', nodeId: 'cond-beta', content: 'beta' } as any],
          action: [{ type: 'Text', nodeId: 'action-beta', content: 'beta-hit' } as any]
        },
        {
          condition: [{ type: 'Literal', nodeId: 'cond-none', value: 'none', valueType: 'none' } as any],
          action: [{ type: 'Text', nodeId: 'action-none', content: 'none-hit' } as any]
        }
      ] as any,
      env,
      runtime,
      undefined,
      [{ type: 'Text', nodeId: 'expression', content: 'beta' } as any]
    );

    expect(result.value).toBe('beta-hit');
  });

  it('rejects none after wildcard placement', () => {
    expect(() =>
      validateNonePlacement([
        { condition: [{ type: 'Literal', nodeId: 'wildcard', value: '*', valueType: 'wildcard' } as any] },
        { condition: [{ type: 'Literal', nodeId: 'none', value: 'none', valueType: 'none' } as any] }
      ] as any)
    ).toThrow('The "none" keyword cannot appear after "*" (wildcard) as it would never be reached');
  });

  it('rejects any-mode condition-level actions as invalid syntax', async () => {
    const env = createEnvironment();
    const runtime = createRuntime();

    await expect(
      evaluateAnyMatch(
        [
          {
            condition: [{ type: 'Text', nodeId: 'cond', content: 'true' } as any],
            action: [{ type: 'Text', nodeId: 'action', content: 'should-fail' } as any]
          }
        ] as any,
        env,
        runtime,
        undefined,
        [{ type: 'Text', nodeId: 'block-action', content: 'block' } as any]
      )
    ).rejects.toThrow('Invalid @when syntax: \'any:\' modifier cannot have individual actions');
  });
});
