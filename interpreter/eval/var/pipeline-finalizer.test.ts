import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { createSimpleTextVariable, type VariableFactoryInitOptions } from '@core/types/variable';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { createPipelineFinalizer } from './pipeline-finalizer';

const mocks = vi.hoisted(() => ({
  processPipeline: vi.fn()
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

function createDirective(withClause?: Record<string, unknown>): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'var',
    location: {
      filePath: '/test/module.mld'
    },
    values: withClause ? { withClause } : {}
  } as unknown as DirectiveNode;
}

function createVariable(value: string = 'original') {
  return createSimpleTextVariable(
    'result',
    value,
    baseSource,
    {
      mx: {
        labels: ['existing'],
        taint: ['existing'],
        sources: ['existing']
      },
      internal: {
        isRetryable: true
      }
    }
  );
}

function createFinalizer(valueNode: unknown, directive: DirectiveNode = createDirective()) {
  return createPipelineFinalizer({
    applySecurityOptions: (
      overrides?: Partial<VariableFactoryInitOptions>
    ): VariableFactoryInitOptions => ({
      mx: {
        ...(overrides?.mx ?? {})
      },
      internal: {
        ...(overrides?.internal ?? {})
      }
    }),
    baseCtx: {
      definedAt: {
        filePath: '/test/module.mld'
      }
    },
    baseInternal: {
      fromPipelineFinalizer: true
    },
    directive,
    env: {} as any,
    extractSecurityFromValue: () => undefined,
    identifier: 'result',
    source: baseSource,
    valueNode
  });
}

describe('pipeline finalizer', () => {
  beforeEach(() => {
    mocks.processPipeline.mockReset();
  });

  it('skips pipeline execution for ExecInvocation with withClause', async () => {
    const variable = createVariable();
    const finalizer = createFinalizer({
      type: 'ExecInvocation',
      withClause: {
        pipeline: [{ rawIdentifier: 'trim' }]
      }
    });

    const result = await finalizer.process(variable);

    expect(result).toBe(variable);
    expect(mocks.processPipeline).not.toHaveBeenCalled();
  });

  it('skips pipeline execution for VariableReference/load-content pipes and command handled by run', async () => {
    const referenceFinalizer = createFinalizer({
      type: 'VariableReference',
      pipes: [{ rawIdentifier: 'trim' }]
    });
    await referenceFinalizer.process(createVariable());

    const loadContentFinalizer = createFinalizer({
      type: 'load-content',
      pipes: [{ rawIdentifier: 'trim' }]
    });
    await loadContentFinalizer.process(createVariable());

    const commandWithClauseFinalizer = createFinalizer(
      {
        type: 'command',
        command: 'echo hello'
      },
      createDirective({
        pipeline: [{ rawIdentifier: 'trim' }]
      })
    );
    await commandWithClauseFinalizer.process(createVariable());

    expect(mocks.processPipeline).not.toHaveBeenCalled();
  });

  it('executes pipeline and rewrites string outputs', async () => {
    const variable = createVariable('before');
    const finalizer = createFinalizer({
      type: 'command',
      command: 'echo before'
    });

    mocks.processPipeline.mockResolvedValue('after');

    const result = await finalizer.process(variable);

    expect(mocks.processPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        value: variable,
        identifier: 'result',
        isRetryable: true
      })
    );
    expect(result.type).toBe('simple-text');
    expect(result.value).toBe('after');
    expect(result.internal?.fromPipelineFinalizer).toBe(true);
  });

  it('does not rewrite when pipeline string output matches existing value', async () => {
    const variable = createVariable('same');
    const finalizer = createFinalizer({
      type: 'command',
      command: 'echo same'
    });

    mocks.processPipeline.mockResolvedValue('same');

    const result = await finalizer.process(variable);

    expect(result).toBe(variable);
  });

  it('rewrites structured pipeline outputs as structured variables', async () => {
    const variable = createVariable('before');
    const finalizer = createFinalizer({
      type: 'command',
      command: 'echo before'
    });

    mocks.processPipeline.mockResolvedValue(
      wrapStructured({ ok: true }, 'json', '{"ok":true}')
    );

    const result = await finalizer.process(variable);

    expect(result.type).toBe('structured');
    expect(result.internal?.isPipelineResult).toBe(true);
    expect(result.value.type).toBe('json');
    expect(result.value.data).toEqual({ ok: true });
  });
});
