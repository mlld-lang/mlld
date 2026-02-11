import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import {
  createRhsDispatcher,
  type RhsDispatcherDependencies
} from './rhs-dispatcher';

const mocks = vi.hoisted(() => ({
  evaluateUnifiedExpression: vi.fn()
}));

vi.mock('../expressions', () => ({
  evaluateUnifiedExpression: mocks.evaluateUnifiedExpression
}));

function createDirectiveStub(wrapperType?: string): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'var',
    location: {
      filePath: '/test/module.mld'
    },
    meta: wrapperType ? { wrapperType } : {}
  } as unknown as DirectiveNode;
}

function createEnvStub(variables: Record<string, unknown> = {}): Environment {
  return {
    getVariable: (name: string) => variables[name]
  } as unknown as Environment;
}

function createDependencies(overrides: Partial<RhsDispatcherDependencies> = {}): RhsDispatcherDependencies {
  const referenceEvaluator = {
    evaluateVariableReference: vi.fn().mockResolvedValue({ resolvedValue: 'ref-value' }),
    evaluateVariableReferenceWithTail: vi.fn().mockResolvedValue({ resolvedValue: 'tail-value' })
  };

  const executionEvaluator = {
    evaluateExecutionBranch: vi.fn().mockResolvedValue({ kind: 'resolved', value: 'exec-value' })
  };

  const rhsContentEvaluator = {
    evaluateFileReference: vi.fn().mockResolvedValue('file-content'),
    evaluateSection: vi.fn().mockResolvedValue('section-content'),
    evaluateLoadContent: vi.fn().mockResolvedValue('loaded-content'),
    evaluatePath: vi.fn().mockResolvedValue('path-content')
  };

  return {
    context: undefined,
    directive: createDirectiveStub(),
    env: createEnvStub(),
    executionEvaluator: executionEvaluator as any,
    identifier: 'assigned',
    interpolateWithSecurity: vi.fn().mockResolvedValue('interpolated'),
    isToolsCollection: false,
    mergeResolvedDescriptor: vi.fn(),
    referenceEvaluator: referenceEvaluator as any,
    rhsContentEvaluator: rhsContentEvaluator as any,
    sourceLocation: undefined,
    ...overrides
  };
}

describe('rhs dispatcher', () => {
  beforeEach(() => {
    mocks.evaluateUnifiedExpression.mockReset();
  });

  it('routes FileReference nodes to content evaluator', async () => {
    const dependencies = createDependencies();
    const dispatcher = createRhsDispatcher(dependencies);

    const result = await dispatcher.evaluate({ type: 'FileReference', source: { raw: 'file.md' } });

    expect(result).toEqual({
      type: 'resolved',
      handler: 'file-reference',
      value: 'file-content'
    });
    expect(dependencies.rhsContentEvaluator.evaluateFileReference).toHaveBeenCalled();
  });

  it('routes section/load-content/path nodes to content evaluator handlers', async () => {
    const dependencies = createDependencies();
    const dispatcher = createRhsDispatcher(dependencies);

    const sectionResult = await dispatcher.evaluate({ type: 'section', path: [], section: [] });
    const loadContentResult = await dispatcher.evaluate({ type: 'load-content', source: { raw: 'file.md' } });
    const pathResult = await dispatcher.evaluate({ type: 'path', segments: [] });

    expect(sectionResult).toEqual({
      type: 'resolved',
      handler: 'section',
      value: 'section-content'
    });
    expect(loadContentResult).toEqual({
      type: 'resolved',
      handler: 'load-content',
      value: 'loaded-content'
    });
    expect(pathResult).toEqual({
      type: 'resolved',
      handler: 'path',
      value: 'path-content'
    });
  });

  it('routes primitive and literal nodes directly', async () => {
    const dispatcher = createRhsDispatcher(createDependencies());

    const primitiveResult = await dispatcher.evaluate(42);
    const literalResult = await dispatcher.evaluate({ type: 'Literal', value: false });

    expect(primitiveResult).toEqual({ type: 'resolved', handler: 'primitive', value: 42 });
    expect(literalResult).toEqual({ type: 'resolved', handler: 'literal', value: false });
  });

  it('routes collection nodes with eager evaluation when not complex', async () => {
    const dispatcher = createRhsDispatcher(createDependencies());

    const arrayResult = await dispatcher.evaluate({
      type: 'array',
      items: [{ type: 'Literal', value: 1 }, { type: 'Literal', value: 2 }]
    });
    const objectResult = await dispatcher.evaluate({
      type: 'object',
      entries: [{ type: 'pair', key: 'count', value: { type: 'Literal', value: 2 } }]
    });

    expect(arrayResult).toEqual({ type: 'resolved', handler: 'array', value: [1, 2] });
    expect(objectResult).toEqual({ type: 'resolved', handler: 'object', value: { count: 2 } });
  });

  it('routes VariableReference and executable reference results', async () => {
    const executableVariable = { type: 'executable', name: 'runTool' } as any;
    const referenceEvaluator = {
      evaluateVariableReference: vi.fn().mockResolvedValue({
        executableVariable,
        resolvedValue: executableVariable
      }),
      evaluateVariableReferenceWithTail: vi.fn().mockResolvedValue({ resolvedValue: 'tail-value' })
    };
    const dispatcher = createRhsDispatcher(
      createDependencies({
        referenceEvaluator: referenceEvaluator as any
      })
    );

    const result = await dispatcher.evaluate({
      type: 'VariableReference',
      identifier: 'tools',
      fields: [{ type: 'field', value: 'runTool' }]
    });

    expect(result).toEqual({
      type: 'executable-variable',
      handler: 'variable-reference',
      variable: executableVariable
    });
  });

  it('routes template arrays and text nodes', async () => {
    const dependencies = createDependencies({
      directive: createDirectiveStub('backtick')
    });
    const dispatcher = createRhsDispatcher(dependencies);

    const templateResult = await dispatcher.evaluate([{ type: 'Text', content: 'hello' }]);
    const textResult = await dispatcher.evaluate({ type: 'Text', content: 'world' });

    expect(templateResult).toEqual({
      type: 'resolved',
      handler: 'template-array',
      value: 'hello'
    });
    expect(textResult).toEqual({
      type: 'resolved',
      handler: 'text',
      value: 'world'
    });
  });

  it('routes VariableReferenceWithTail through reference evaluator tail handler', async () => {
    const dependencies = createDependencies();
    const dispatcher = createRhsDispatcher(dependencies);

    const result = await dispatcher.evaluate({
      type: 'VariableReferenceWithTail',
      identifier: 'tailAssigned',
      variable: { type: 'VariableReference', identifier: 'payload' },
      withClause: { pipeline: [{ rawIdentifier: 'trim' }] }
    });

    expect(result).toEqual({
      type: 'resolved',
      handler: 'variable-reference-tail',
      value: 'tail-value'
    });
    expect(dependencies.referenceEvaluator.evaluateVariableReferenceWithTail).toHaveBeenCalled();
  });

  it('routes expression nodes to evaluateUnifiedExpression', async () => {
    mocks.evaluateUnifiedExpression.mockResolvedValue({ value: 123 });
    const dispatcher = createRhsDispatcher(createDependencies());

    const result = await dispatcher.evaluate({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: { type: 'Literal', value: 2 }
    });

    expect(result).toEqual({
      type: 'resolved',
      handler: 'expression',
      value: 123
    });
    expect(mocks.evaluateUnifiedExpression).toHaveBeenCalled();
  });

  it('routes execution nodes and preserves control/for-expression results', async () => {
    const executionEvaluator = {
      evaluateExecutionBranch: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'return-control', value: { __exeReturn: true, value: 'done' } })
        .mockResolvedValueOnce({ kind: 'for-expression', variable: { type: 'array', value: [1] } })
        .mockResolvedValueOnce({ kind: 'resolved', value: 'exec-value' })
    };
    const dispatcher = createRhsDispatcher(
      createDependencies({
        executionEvaluator: executionEvaluator as any
      })
    );

    const returnControl = await dispatcher.evaluate({ type: 'ExeBlock', body: [] });
    const forExpression = await dispatcher.evaluate({ type: 'ForExpression' });
    const executionValue = await dispatcher.evaluate({ type: 'ExecInvocation' });

    expect(returnControl).toEqual({
      type: 'return-control',
      handler: 'execution',
      value: { __exeReturn: true, value: 'done' }
    });
    expect(forExpression).toEqual({
      type: 'for-expression',
      handler: 'execution',
      variable: { type: 'array', value: [1] }
    });
    expect(executionValue).toEqual({
      type: 'resolved',
      handler: 'execution',
      value: 'exec-value'
    });
  });

  it('routes unknown nodes through fallback interpolation', async () => {
    const interpolateWithSecurity = vi.fn().mockResolvedValue('fallback-text');
    const dispatcher = createRhsDispatcher(
      createDependencies({
        interpolateWithSecurity
      })
    );

    const result = await dispatcher.evaluate({ type: 'UnknownNode', payload: true });

    expect(result).toEqual({
      type: 'resolved',
      handler: 'fallback',
      value: 'fallback-text'
    });
    expect(interpolateWithSecurity).toHaveBeenCalledWith([
      { type: 'UnknownNode', payload: true }
    ]);
  });
});
