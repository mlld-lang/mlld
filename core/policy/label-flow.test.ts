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

  it('matches fact-pattern label rules against tiered fact labels', () => {
    const policy: PolicyConfig = {
      labels: {
        'fact:*.email': { deny: ['op:output'] }
      }
    };

    const allowed = checkLabelFlow(
      {
        inputTaint: ['fact:internal:@contact.email'],
        opLabels: ['op:show'],
        exeLabels: []
      },
      policy
    );
    expect(allowed.allowed).toBe(true);

    const denied = checkLabelFlow(
      {
        inputTaint: ['fact:internal:@contact.email'],
        opLabels: ['op:output'],
        exeLabels: []
      },
      policy
    );
    expect(denied.allowed).toBe(false);
    expect(denied.rule).toBe('policy.labels.fact:*.email.deny');
  });
});

describe('checkLabelFlow operations mapping', () => {
  it('maps semantic operation labels to risk categories', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil'] },
      operations: { exfil: ['net:w'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: [],
        exeLabels: ['net:w']
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('policy.defaults.rules.no-secret-exfil');
    expect(result.matched).toBe('exfil');
  });

  it('allows operations when no mapping triggers rules', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil'] },
      operations: { exfil: ['net:w'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: [],
        exeLabels: ['safe']
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });

  it('preserves original labels alongside mapped labels', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil'] },
      operations: { exfil: ['net:w'] },
      labels: {
        secret: { deny: ['net:w'] }
      }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: [],
        exeLabels: ['net:w']
      },
      policy
    );

    expect(result.allowed).toBe(false);
  });

  it('works with op: labels from opLabels', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { destructive: ['op:cmd:rm'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: ['untrusted'],
        opLabels: ['op:cmd:rm'],
        exeLabels: []
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('policy.defaults.rules.no-untrusted-destructive');
    expect(result.matched).toBe('destructive');
  });

  it('handles multiple mappings', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-secret-exfil', 'no-untrusted-destructive'] },
      operations: {
        exfil: ['net:w'],
        destructive: ['op:sh']
      }
    };

    const secretToNet = checkLabelFlow(
      {
        inputTaint: ['secret'],
        opLabels: [],
        exeLabels: ['net:w']
      },
      policy
    );
    expect(secretToNet.allowed).toBe(false);
    expect(secretToNet.matched).toBe('exfil');

    const untrustedToSh = checkLabelFlow(
      {
        inputTaint: ['untrusted'],
        opLabels: ['op:sh'],
        exeLabels: []
      },
      policy
    );
    expect(untrustedToSh.allowed).toBe(false);
    expect(untrustedToSh.matched).toBe('destructive');
  });

  it('works without operations mapping', () => {
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
    expect(result.matched).toBe('exfil');
  });

  it('requires the first exfil:send argument to carry known', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['exfil:send'],
        exeLabels: [],
        inputs: [
          { labels: ['untrusted'], taint: ['untrusted'] },
          { labels: ['known'], taint: ['known'] }
        ]
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('policy.defaults.rules.no-send-to-unknown');
    expect(result.matched).toBe('exfil:send');
  });

  it('treats known:internal as satisfying no-send-to-unknown', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-unknown'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['exfil:send'],
        exeLabels: [],
        inputs: [
          { labels: ['known:internal'], taint: ['known:internal'] }
        ]
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });

  it('requires known:internal when no-send-to-external is enabled', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-send-to-external'] }
    };

    const denied = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['exfil:send'],
        exeLabels: [],
        inputs: [
          { labels: ['known'], taint: ['known'] }
        ]
      },
      policy
    );

    expect(denied.allowed).toBe(false);
    expect(denied.rule).toBe('policy.defaults.rules.no-send-to-external');

    const allowed = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['exfil:send'],
        exeLabels: [],
        inputs: [
          { labels: ['known:internal'], taint: ['known:internal'] }
        ]
      },
      policy
    );

    expect(allowed.allowed).toBe(true);
  });

  it('requires the first destructive:targeted argument to carry known', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['destructive:targeted'],
        exeLabels: [],
        inputs: [
          { labels: ['untrusted'], taint: ['untrusted'] },
          { labels: ['known'], taint: ['known'] }
        ]
      },
      policy
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('policy.defaults.rules.no-destroy-unknown');
    expect(result.matched).toBe('destructive:targeted');
  });

  it('treats known:internal as satisfying no-destroy-unknown', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['destructive:targeted:file'],
        exeLabels: [],
        inputs: [
          { labels: ['known:internal'], taint: ['known:internal'] }
        ]
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });

  it('does not apply no-destroy-unknown to destructive:untargeted operations', () => {
    const policy: PolicyConfig = {
      defaults: { rules: ['no-destroy-unknown'] }
    };

    const result = checkLabelFlow(
      {
        inputTaint: [],
        opLabels: ['destructive:untargeted'],
        exeLabels: [],
        inputs: [
          { labels: ['untrusted'], taint: ['untrusted'] }
        ]
      },
      policy
    );

    expect(result.allowed).toBe(true);
  });
});
