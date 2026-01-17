import { describe, expect, it } from 'vitest';
import { checkLabelFlow } from '@core/policy/label-flow';
import type { PolicyConfig } from '@core/policy/union';
import { getOperationLabels } from '@core/policy/operation-labels';

describe('label flow', () => {
  it('denies when a label blocks the operation', () => {
    const policy: PolicyConfig = {
      labels: {
        secret: {
          deny: ['op:show']
        }
      }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: getOperationLabels({ type: 'show' }),
        exeLabels: []
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.matched).toBe('op:show');
  });

  it('allows a more specific rule to override a deny', () => {
    const policy: PolicyConfig = {
      labels: {
        secret: {
          deny: ['op:cmd:echo'],
          allow: ['op:cmd:echo:status']
        }
      }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: getOperationLabels({
          type: 'cmd',
          command: 'echo',
          subcommand: 'status'
        }),
        exeLabels: []
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });

  it('skips label checks for using flows', () => {
    const policy: PolicyConfig = {
      labels: {
        secret: {
          deny: ['op:show']
        }
      }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: getOperationLabels({ type: 'show' }),
        exeLabels: [],
        flowChannel: 'using'
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });
});
