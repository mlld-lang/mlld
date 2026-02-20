import { describe, expect, it } from 'vitest';
import { normalizeExecutableDescriptor } from './normalize-executable';

describe('normalizeExecutableDescriptor', () => {
  it('normalizes partial definitions with bound arguments and operation type derivation', () => {
    const commandVar = {
      type: 'executable',
      name: 'stage',
      value: { type: 'code', template: 'ignored' },
      internal: {
        executableDef: {
          type: 'partial',
          boundArgs: ['BOUND-FIRST'],
          paramNames: ['first', 'second'],
          base: {
            type: 'code',
            codeTemplate: [],
            language: 'nodejs',
            paramNames: ['first', 'second', 'third']
          }
        }
      }
    };

    const normalized = normalizeExecutableDescriptor(commandVar);

    expect(normalized.execDef).toBe(commandVar.internal.executableDef.base);
    expect(normalized.boundArgs).toEqual(['BOUND-FIRST']);
    expect(normalized.baseParamNames).toEqual(['first', 'second', 'third']);
    expect(normalized.paramNames).toEqual(['first', 'second']);
    expect(normalized.stageLanguage).toBe('nodejs');
    expect(normalized.opType).toBe('node');
  });

  it('detects mlld-when expressions from canonical executable definitions', () => {
    const whenNode = {
      type: 'WhenExpression',
      branches: []
    };

    const commandVar = {
      type: 'executable',
      name: 'retryer',
      value: { type: 'code', template: [] },
      internal: {
        executableDef: {
          type: 'code',
          language: 'mlld-when',
          codeTemplate: [whenNode],
          paramNames: ['input']
        }
      }
    };

    const normalized = normalizeExecutableDescriptor(commandVar);

    expect(normalized.whenExprNode).toBe(whenNode);
    expect(normalized.paramNames).toEqual(['input']);
  });

  it('preserves non-executable error category and message stem', () => {
    expect(() =>
      normalizeExecutableDescriptor({
        type: 'simple-text',
        value: 'noop'
      })
    ).toThrow('Cannot execute non-executable variable in pipeline:');
  });
});
