import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { createSimpleTextVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { createReferenceEvaluator } from './reference-evaluator';

const mocks = vi.hoisted(() => ({
  accessField: vi.fn(),
  accessFields: vi.fn(),
  processPipeline: vi.fn(),
  resolveVariable: vi.fn()
}));

vi.mock('@interpreter/utils/variable-resolution', () => ({
  ResolutionContext: {
    FieldAccess: 'FieldAccess',
    PipelineInput: 'PipelineInput',
    VariableCopy: 'VariableCopy'
  },
  resolveVariable: mocks.resolveVariable
}));

vi.mock('@interpreter/utils/field-access', () => ({
  accessField: mocks.accessField,
  accessFields: mocks.accessFields
}));

vi.mock('../pipeline/unified-processor', () => ({
  processPipeline: mocks.processPipeline
}));

const baseSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnvStub(variables: Record<string, unknown>): Environment {
  return {
    getVariable: (name: string) => variables[name]
  } as unknown as Environment;
}

function createDescriptorStateStub() {
  const sourceDescriptor: SecurityDescriptor = {
    labels: ['source'],
    taint: ['source'],
    sources: []
  };

  return {
    descriptorFromVariable: vi.fn().mockReturnValue(sourceDescriptor),
    getResolvedDescriptor: vi.fn().mockReturnValue(undefined),
    mergePipelineDescriptor: vi.fn((left?: SecurityDescriptor, right?: SecurityDescriptor) => left ?? right)
  };
}

function createDirectiveStub(): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'var',
    location: {
      filePath: '/test/module.mld'
    }
  } as unknown as DirectiveNode;
}

describe('reference evaluator', () => {
  beforeEach(() => {
    mocks.accessField.mockReset();
    mocks.accessFields.mockReset();
    mocks.processPipeline.mockReset();
    mocks.resolveVariable.mockReset();
  });

  it('resolves field-access references and applies condensed pipelines', async () => {
    const sourceVar = createSimpleTextVariable('user', 'ignored', baseSource);
    const env = createEnvStub({ user: sourceVar });
    const descriptorState = createDescriptorStateStub();

    mocks.resolveVariable.mockResolvedValue({ profile: { name: 'adam' } });
    mocks.accessField
      .mockResolvedValueOnce({ value: { name: 'adam' }, accessPath: 'profile' })
      .mockResolvedValueOnce({ value: 'adam', accessPath: 'profile.name' });
    mocks.processPipeline.mockResolvedValue('ADAM');

    const evaluator = createReferenceEvaluator({
      descriptorState,
      directive: createDirectiveStub(),
      env
    });

    const result = await evaluator.evaluateVariableReference(
      {
        type: 'VariableReference',
        identifier: 'user',
        fields: [{ type: 'field', value: 'profile' }, { type: 'field', value: 'name' }],
        pipes: [{ rawIdentifier: 'upper' }]
      },
      'nameUpper'
    );

    expect(result).toEqual({ resolvedValue: 'ADAM' });
    expect(mocks.processPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'nameUpper',
        descriptorHint: expect.objectContaining({ labels: ['source'] }),
        value: 'adam'
      })
    );
  });

  it('returns executable field values without pipeline conversion', async () => {
    const sourceVar = createSimpleTextVariable('tools', 'ignored', baseSource);
    const executableVariable = {
      type: 'executable',
      name: 'build'
    } as any;
    const env = createEnvStub({ tools: sourceVar });

    mocks.resolveVariable.mockResolvedValue({ build: executableVariable });
    mocks.accessField.mockResolvedValue({ value: executableVariable, accessPath: 'build' });

    const evaluator = createReferenceEvaluator({
      descriptorState: createDescriptorStateStub(),
      directive: createDirectiveStub(),
      env
    });

    const result = await evaluator.evaluateVariableReference(
      {
        type: 'VariableReference',
        identifier: 'tools',
        fields: [{ type: 'field', value: 'build' }]
      },
      'toolRef'
    );

    expect(result.executableVariable).toBe(executableVariable);
    expect(result.resolvedValue).toBe(executableVariable);
    expect(mocks.processPipeline).not.toHaveBeenCalled();
  });

  it('uses pipeline-input resolution context for tail pipelines without field access', async () => {
    const payload = createSimpleTextVariable('payload', '{"count":1}', baseSource);
    const env = createEnvStub({ payload });
    const descriptorState = createDescriptorStateStub();

    mocks.resolveVariable.mockResolvedValue('{"count":1}');
    mocks.processPipeline.mockResolvedValue({ count: 1 });

    const evaluator = createReferenceEvaluator({
      descriptorState,
      directive: createDirectiveStub(),
      env
    });

    const result = await evaluator.evaluateVariableReferenceWithTail(
      {
        type: 'VariableReferenceWithTail',
        identifier: 'parsed',
        variable: {
          type: 'VariableReference',
          identifier: 'payload'
        },
        withClause: {
          pipeline: [{ rawIdentifier: 'parseJson' }]
        }
      },
      'parsed'
    );

    expect(result).toEqual({ resolvedValue: { count: 1 } });
    expect(mocks.resolveVariable).toHaveBeenCalledWith(payload, env, 'PipelineInput');
    expect(mocks.processPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'parsed',
        value: '{"count":1}'
      })
    );
  });
});
