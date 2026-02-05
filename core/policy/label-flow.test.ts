import { describe, it, expect } from 'vitest';
import { checkLabelFlow } from './label-flow';
import type { PolicyConfig } from './union';

describe('checkLabelFlow defaults', () => {
  it('blocks secret exfiltration when enabled', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: ['exfil'],
        exeLabels: []
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('policy.defaults.rules.no-secret-exfil');
  });

  it('blocks sensitive exfiltration when enabled', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-sensitive-exfil'] }
    };

    const denied = checkLabelFlow(
      {
        inputTaint: ['sensitive'],
        opLabels: ['exfil'],
        exeLabels: []
      },
      policy
    );
    expect(denied.allowed).toBe(false);
    expect(denied.rule).toBe('policy.defaults.rules.no-sensitive-exfil');
  });

  it('enforces allow lists for unlabeled untrusted data', () => {
    const policy: PolicyConfig = {
      defaults: { unlabeled: 'untrusted' },
      labels: {
        'src:exec': { allow: ['op:show'] }
      }
    };

    const allowed = checkLabelFlow(
      {
        inputTaint: ['src:exec'],
        opLabels: ['op:show'],
        exeLabels: []
      },
      policy
    );
    expect(allowed.allowed).toBe(true);

    const denied = checkLabelFlow(
      {
        inputTaint: ['src:exec'],
        opLabels: ['op:output'],
        exeLabels: []
      },
      policy
    );
    expect(denied.allowed).toBe(false);
    expect(denied.rule).toBe('policy.labels.src:exec.allow');
  });

  it('does not enforce allow lists when unlabeled is trusted', () => {
    const policy: PolicyConfig = {
      defaults: { unlabeled: 'trusted' },
      labels: {
        'src:exec': { allow: ['op:show'] }
      }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['src:exec'],
        opLabels: ['op:output'],
        exeLabels: []
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });
});
