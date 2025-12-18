import { describe, it, expect, vi } from 'vitest';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import { extractDirectiveInputs } from './directive-inputs';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';

vi.mock('./directive-replay', () => ({
  replayInlineExecInvocations: vi.fn(async () => [])
}));

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createSecretVariable() {
  return createSimpleTextVariable(
    'secret',
    'value',
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels: ['secret'] })
    }
  );
}

function buildExecInvocation(): ExecInvocation {
  return {
    type: 'ExecInvocation',
    nodeId: 'root',
    location: null,
    commandRef: {
      type: 'CommandReference',
      nodeId: 'root-ref',
      location: null,
      identifier: 'mask',
      args: [
        {
          type: 'ExecInvocation',
          nodeId: 'nested',
          location: null,
          commandRef: {
            type: 'CommandReference',
            nodeId: 'nested-ref',
            location: null,
            identifier: 'slice',
            objectReference: {
              type: 'VariableReference',
              nodeId: 'secret-ref',
              location: null,
              identifier: 'secret'
            },
            args: []
          }
        }
      ]
    }
  } as unknown as ExecInvocation;
}

describe('extractDirectiveInputs', () => {
  it('collects guard inputs from exec invocation arguments inside show directives', async () => {
    const env = createEnv();
    env.setVariable('secret', createSecretVariable());

    const directive = {
      kind: 'show',
      subtype: 'showExecInvocation',
      values: {
        invocation: buildExecInvocation()
      }
    } as unknown as DirectiveNode;

    const inputs = await extractDirectiveInputs(directive, env);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].mx?.labels).toContain('secret');
  });

  it('surfaces descriptors for /run commands referencing expression variables', async () => {
    const env = createEnv();
    env.setVariable('secret', createSecretVariable());

    const directive = {
      kind: 'run',
      subtype: 'runCommand',
      values: {
        command: [
          { type: 'Text', content: 'curl "', nodeId: 'text-1', location: null },
          {
            type: 'VariableReference',
            nodeId: 'secret-ref',
            location: null,
            identifier: 'secret'
          },
          { type: 'Text', content: '"', nodeId: 'text-2', location: null }
        ]
      }
    } as unknown as DirectiveNode;

    const inputs = await extractDirectiveInputs(directive, env);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].mx?.labels).toContain('secret');
  });
});
