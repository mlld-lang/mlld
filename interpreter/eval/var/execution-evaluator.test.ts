import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { Environment } from '@interpreter/env/Environment';
import { createExecutionEvaluator } from './execution-evaluator';

const mocks = vi.hoisted(() => ({
  evaluateExeBlock: vi.fn(),
  evaluateForExpression: vi.fn(),
  evaluateNewExpression: vi.fn(),
  evaluateRun: vi.fn(),
  extractVariableValue: vi.fn(),
  isVariable: vi.fn(),
  processCommandOutput: vi.fn()
}));

vi.mock('../run', () => ({
  evaluateRun: mocks.evaluateRun
}));

vi.mock('../exe', () => ({
  evaluateExeBlock: mocks.evaluateExeBlock
}));

vi.mock('../for', () => ({
  evaluateForExpression: mocks.evaluateForExpression
}));

vi.mock('../new-expression', () => ({
  evaluateNewExpression: mocks.evaluateNewExpression
}));

vi.mock('@interpreter/utils/json-auto-parser', () => ({
  processCommandOutput: mocks.processCommandOutput
}));

vi.mock('@interpreter/utils/variable-resolution', () => ({
  extractVariableValue: mocks.extractVariableValue,
  isVariable: mocks.isVariable
}));

function createDirectiveStub(withClause?: Record<string, unknown>): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'var',
    location: {
      filePath: '/test/module.mld'
    },
    values: withClause ? { withClause } : {}
  } as unknown as DirectiveNode;
}

function createEnvStub(overrides: Partial<Environment> = {}): Environment {
  return {
    createChild: vi.fn(() => ({} as Environment)),
    executeCommand: vi.fn(),
    ...overrides
  } as unknown as Environment;
}

function createDescriptorStateStub() {
  return {
    descriptorFromVariable: vi.fn().mockReturnValue({ labels: ['for'], taint: ['for'], sources: [] }),
    mergeResolvedDescriptor: vi.fn()
  };
}

describe('execution evaluator', () => {
  beforeEach(() => {
    mocks.evaluateExeBlock.mockReset();
    mocks.evaluateForExpression.mockReset();
    mocks.evaluateNewExpression.mockReset();
    mocks.evaluateRun.mockReset();
    mocks.extractVariableValue.mockReset();
    mocks.isVariable.mockReset();
    mocks.processCommandOutput.mockReset();
  });

  it('delegates command nodes with withClause to evaluateRun', async () => {
    const env = createEnvStub();
    const descriptorState = createDescriptorStateStub();

    mocks.evaluateRun.mockResolvedValue({ value: 'from-run' });

    const evaluator = createExecutionEvaluator({
      descriptorState,
      directive: createDirectiveStub({ pipeline: [{ rawIdentifier: 'trim' }] }),
      env,
      interpolateWithSecurity: vi.fn()
    });

    const result = await evaluator.evaluateExecutionBranch(
      {
        type: 'command',
        command: 'echo hi',
        meta: { raw: 'echo hi' }
      },
      'output'
    );

    expect(result).toEqual({ kind: 'resolved', value: 'from-run' });
    expect(mocks.evaluateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'run',
        subtype: 'runCommand',
        meta: expect.objectContaining({ isDataValue: true }),
        values: expect.objectContaining({
          command: 'echo hi',
          withClause: expect.objectContaining({ pipeline: [{ rawIdentifier: 'trim' }] })
        })
      }),
      env
    );
    expect(env.executeCommand).not.toHaveBeenCalled();
  });

  it('executes command arrays directly when no withClause is present', async () => {
    const env = createEnvStub({
      executeCommand: vi.fn().mockResolvedValue('{"ok":true}')
    });
    const descriptorState = createDescriptorStateStub();
    const interpolateWithSecurity = vi.fn().mockResolvedValue('echo {"ok":true}');

    mocks.processCommandOutput.mockReturnValue({ ok: true });

    const evaluator = createExecutionEvaluator({
      descriptorState,
      directive: createDirectiveStub(),
      env,
      interpolateWithSecurity
    });

    const result = await evaluator.evaluateExecutionBranch(
      {
        type: 'command',
        command: [{ type: 'Text', content: 'echo {"ok":true}' }],
        meta: { raw: 'echo {"ok":true}' }
      },
      'jsonOutput'
    );

    expect(result).toEqual({ kind: 'resolved', value: { ok: true } });
    expect(interpolateWithSecurity).toHaveBeenCalledWith(
      [{ type: 'Text', content: 'echo {"ok":true}' }],
      InterpolationContext.ShellCommand
    );
    expect(env.executeCommand).toHaveBeenCalledWith('echo {"ok":true}', undefined);
    expect(mocks.processCommandOutput).toHaveBeenCalledWith('{"ok":true}');
  });

  it('returns explicit control result for ExeBlock return controls', async () => {
    const env = createEnvStub();

    mocks.evaluateExeBlock.mockResolvedValue({ value: { __exeReturn: true, value: 'done' } });

    const evaluator = createExecutionEvaluator({
      descriptorState: createDescriptorStateStub(),
      directive: createDirectiveStub(),
      env,
      interpolateWithSecurity: vi.fn()
    });

    const result = await evaluator.evaluateExecutionBranch(
      {
        type: 'ExeBlock',
        body: []
      },
      'blockValue'
    );

    expect(result).toEqual({
      kind: 'return-control',
      value: { __exeReturn: true, value: 'done' }
    });
  });

  it('returns for-expression variables and merges descriptor hints', async () => {
    const env = createEnvStub();
    const descriptorState = createDescriptorStateStub();
    const forVariable = {
      type: 'array',
      value: [1, 2, 3],
      mx: {
        labels: ['for'],
        taint: ['for'],
        sources: []
      }
    } as any;

    mocks.evaluateForExpression.mockResolvedValue(forVariable);

    const evaluator = createExecutionEvaluator({
      descriptorState,
      directive: createDirectiveStub(),
      env,
      interpolateWithSecurity: vi.fn()
    });

    const result = await evaluator.evaluateExecutionBranch(
      {
        type: 'ForExpression',
        source: { type: 'VariableReference', identifier: 'items' }
      },
      'mapped'
    );

    expect(result).toEqual({ kind: 'for-expression', variable: forVariable });
    expect(descriptorState.mergeResolvedDescriptor).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['for'] })
    );
  });

  it('enforces tool subset constraints for NewExpression with withClause tools', async () => {
    const env = createEnvStub();

    mocks.evaluateNewExpression.mockResolvedValue({
      provider: '@local',
      tools: ['read']
    });

    const evaluator = createExecutionEvaluator({
      descriptorState: createDescriptorStateStub(),
      directive: createDirectiveStub({ tools: ['read', 'write'] }),
      env,
      interpolateWithSecurity: vi.fn()
    });

    await expect(
      evaluator.evaluateExecutionBranch(
        {
          type: 'NewExpression',
          base: { type: 'VariableReference', identifier: 'baseEnv' }
        },
        'childEnv'
      )
    ).rejects.toThrow(/Tool scope cannot add tools outside parent/);
  });
});
