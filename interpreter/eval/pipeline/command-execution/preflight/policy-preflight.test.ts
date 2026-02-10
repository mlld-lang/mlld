import { describe, expect, it } from 'vitest';
import { MlldDenialError } from '@core/errors/denial';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { runPolicyPreflight } from './policy-preflight';

const TEXT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createUntrustedInput() {
  return createSimpleTextVariable('input', 'tainted-data', TEXT_SOURCE, {
    mx: {
      labels: ['untrusted'],
      taint: ['untrusted'],
      sources: ['src:test'],
      policy: null
    }
  });
}

describe('policy preflight extraction parity', () => {
  it('preserves policy label-flow denial behavior for destructive code operations', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    env.recordPolicyConfig('test-policy', {
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { 'op:sh': 'destructive' }
    });

    const untrustedInput = createUntrustedInput();

    await expect(
      runPolicyPreflight({
        env,
        execEnv,
        execDef: { type: 'code', codeTemplate: ['echo'] },
        commandVar: {
          type: 'executable',
          name: 'stage',
          mx: {
            labels: [],
            taint: [],
            sources: [],
            policy: null
          }
        },
        guardInputs: [untrustedInput],
        opType: 'sh'
      })
    ).rejects.toBeInstanceOf(MlldDenialError);

    await expect(
      runPolicyPreflight({
        env,
        execEnv,
        execDef: { type: 'code', codeTemplate: ['echo'] },
        commandVar: {
          type: 'executable',
          name: 'stage',
          mx: {
            labels: [],
            taint: [],
            sources: [],
            policy: null
          }
        },
        guardInputs: [untrustedInput],
        opType: 'sh'
      })
    ).rejects.toMatchObject({
      context: {
        code: 'POLICY_LABEL_FLOW_DENIED'
      }
    });
  });

  it('initializes output policy descriptor labels for influenced outputs', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    env.recordPolicyConfig('test-policy', {
      defaults: { rules: ['untrusted-llms-get-influenced'] }
    });

    const descriptor = await runPolicyPreflight({
      env,
      execEnv,
      execDef: { type: 'code', codeTemplate: ['return 1'] },
      commandVar: {
        type: 'executable',
        name: 'llmStage',
        mx: {
          labels: ['llm'],
          taint: [],
          sources: [],
          policy: null
        }
      },
      guardInputs: [createUntrustedInput()],
      opType: 'js'
    });

    expect(descriptor?.labels ?? []).toContain('influenced');
  });
});
