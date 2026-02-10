import { describe, expect, it } from 'vitest';
import type { GuardContextSnapshot } from '@interpreter/env/ContextManager';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import type { PerInputCandidate } from '@interpreter/hooks/guard-candidate-selection';
import type { OperationSnapshot } from '@interpreter/hooks/guard-operation-keys';
import {
  buildInputPreview,
  buildVariablePreview,
  cloneVariableForGuard,
  cloneVariableForReplacement,
  normalizeGuardReplacements,
  resolveGuardValue
} from '@interpreter/hooks/guard-materialization';
import { cloneGuardContextSnapshot } from '@interpreter/hooks/guard-context-snapshot';

function createVariable(name: string, value: unknown, labels: string[] = []): Variable {
  const variable = createSimpleTextVariable(
    name,
    typeof value === 'string' ? value : `${name}-value`,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels, sources: [`source:${name}`] })
    }
  ) as Variable;
  (variable as any).value = value;
  return variable;
}

describe('guard materialization utilities', () => {
  it('builds previews for mixed variable shapes and redacts secret labels', () => {
    const textVar = createVariable('text', 'hello world');
    const objectTextVar = createVariable('objectText', { text: 'from-text-field' });
    const objectVar = createVariable('object', { nested: 42 });
    const secretVar = createVariable('secret', 'classified', ['secret']);

    expect(buildVariablePreview(textVar)).toBe('hello world');
    expect(buildVariablePreview(objectTextVar)).toBe('from-text-field');
    expect(buildVariablePreview(objectVar)).toBe(JSON.stringify({ nested: 42 }));
    expect(buildVariablePreview(secretVar)).toBe('[REDACTED]');
  });

  it('builds per-input and per-operation previews with redaction policy', () => {
    const visibleVar = createVariable('visible', 'ok');
    const secretVar = createVariable('hidden', 'secret', ['secret']);

    const visibleCandidate: PerInputCandidate = {
      index: 0,
      variable: visibleVar,
      labels: [],
      sources: [],
      taint: [],
      guards: []
    };
    const secretCandidate: PerInputCandidate = {
      index: 1,
      variable: secretVar,
      labels: ['secret'],
      sources: [],
      taint: [],
      guards: []
    };
    const opSnapshot: OperationSnapshot = {
      labels: [],
      sources: [],
      taint: [],
      aggregate: {
        labels: [],
        sources: [],
        taint: []
      } as any,
      variables: [visibleVar, secretVar]
    };

    expect(buildInputPreview('perInput', visibleCandidate)).toBe('ok');
    expect(buildInputPreview('perInput', secretCandidate)).toBe('[REDACTED]');
    expect(buildInputPreview('perOperation', undefined, opSnapshot)).toBe('Array(len=2)');
  });

  it('resolves guard values and normalizes replacement arrays', () => {
    const textVar = createVariable('text', { text: 'text-field' });
    const dataVar = createVariable('data', { data: 'data-field' });
    const nullVar = createVariable('nullish', null);
    const fallback = createVariable('fallback', 'fallback-preview');
    const replacementA = createVariable('ra', 'a');
    const replacementB = createVariable('rb', 'b');

    expect(resolveGuardValue(textVar, fallback)).toBe('text-field');
    expect(resolveGuardValue(dataVar, fallback)).toBe('data-field');
    expect(resolveGuardValue(nullVar, fallback)).toBe('fallback-preview');
    expect(resolveGuardValue(undefined, fallback)).toBe('fallback-preview');

    expect(normalizeGuardReplacements(replacementA).map(variable => variable.name)).toEqual(['ra']);
    expect(
      normalizeGuardReplacements([replacementA, 'skip', replacementB]).map(variable => variable.name)
    ).toEqual(['ra', 'rb']);
  });

  it('materializes replacement clones across text/object/array values', () => {
    const textVar = createVariable('text', 'plain');
    const objectVar = createVariable('object', { value: 1 });
    const arrayVar = createVariable('array', [{ id: 1 }, { id: 2 }]);
    const descriptor = makeSecurityDescriptor({ labels: ['blessed'], sources: ['guard:tag'] });

    const clonedText = cloneVariableForReplacement(textVar, descriptor);
    const clonedObject = cloneVariableForReplacement(objectVar, descriptor);
    const clonedArray = cloneVariableForReplacement(arrayVar, descriptor);

    expect(clonedText).not.toBe(textVar);
    expect((clonedText as any).value).toBe('plain');
    expect((clonedObject as any).value).toEqual({ value: 1 });
    expect((clonedArray as any).value).toEqual([{ id: 1 }, { id: 2 }]);
    expect(clonedText.mx?.labels).toEqual(expect.arrayContaining(['blessed']));
    expect(clonedObject.mx?.labels).toEqual(expect.arrayContaining(['blessed']));
    expect(clonedArray.mx?.labels).toEqual(expect.arrayContaining(['blessed']));
  });
});

describe('guard context snapshot utilities', () => {
  it('clones and redacts context snapshots without mutating input context', () => {
    const secretInput = createVariable('secretInput', 'top-secret', ['secret']);
    const publicInput = createVariable('publicInput', 'visible');
    const secretOutput = createVariable('secretOutput', 'hidden', ['secret']);

    const context: GuardContextSnapshot = {
      attempt: 2,
      try: 2,
      labels: ['secret'],
      sources: ['source:secretInput'],
      input: [secretInput, publicInput],
      output: secretOutput,
      inputPreview: 'should redact',
      outputPreview: 'should redact',
      tries: [{ attempt: 1, decision: 'retry' }],
      hintHistory: ['retry once']
    };

    const cloned = cloneGuardContextSnapshot(context);

    expect(cloned).not.toBe(context);
    expect(cloned.tries).toEqual([{ attempt: 1, decision: 'retry' }]);
    expect(cloned.tries).not.toBe(context.tries);
    expect(cloned.inputPreview).toBe('[REDACTED]');
    expect(cloned.outputPreview).toBe('[REDACTED]');

    const clonedInputArray = cloned.input as unknown[];
    expect(clonedInputArray[0]).toBe('[REDACTED]');
    expect((clonedInputArray[1] as Variable).name).toBe('input');
    expect(cloned.output).toBe('[REDACTED]');

    const originalInputArray = context.input as unknown[];
    expect((originalInputArray[1] as Variable).name).toBe('publicInput');
  });

  it('clones non-secret variables for guard context input snapshots', () => {
    const input = createVariable('plain', 'visible');
    const context: GuardContextSnapshot = {
      attempt: 1,
      labels: ['public'],
      input,
      output: input,
      inputPreview: 'visible',
      outputPreview: 'visible'
    };

    const cloned = cloneGuardContextSnapshot(context);

    expect((cloned.input as Variable).name).toBe('input');
    expect((cloned.output as Variable).name).toBe('input');
  });
});
