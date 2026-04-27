import { describe, expect, it } from 'vitest';
import {
  createStructuredValueVariable,
  VariableMetadataUtils,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { makeSecurityDescriptor } from '@core/types/security';

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

describe('VariableFactory.createStructuredValue', () => {
  it('preserves lazy structured object text during variable creation', () => {
    let toJsonCalls = 0;
    const wrapped = wrapStructured(
      {
        name: 'Ada',
        toJSON() {
          toJsonCalls += 1;
          return { name: 'Ada' };
        }
      },
      'object'
    );

    const beforeDescriptor = Object.getOwnPropertyDescriptor(wrapped, 'text');
    expect(beforeDescriptor?.get).toBeTypeOf('function');
    expect(toJsonCalls).toBe(0);

    const variable = createStructuredValueVariable('contact', wrapped, SOURCE);
    expect(toJsonCalls).toBe(0);

    const afterDescriptor = Object.getOwnPropertyDescriptor(variable.value, 'text');
    expect(afterDescriptor?.get).toBeTypeOf('function');
    expect(variable.mx.length).toBeUndefined();
    expect(toJsonCalls).toBe(0);

    expect(variable.value.text).toBe('{"name":"Ada"}');
    expect(toJsonCalls).toBe(1);
  });

  it('does not materialize lazy structured object text while building mx on demand', () => {
    let toJsonCalls = 0;
    const wrapped = wrapStructured(
      {
        name: 'Ada',
        toJSON() {
          toJsonCalls += 1;
          return { name: 'Ada' };
        }
      },
      'object'
    );

    const variable: Variable = {
      type: 'structured',
      name: 'contact',
      value: wrapped,
      source: SOURCE,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      internal: {}
    } as Variable;

    VariableMetadataUtils.attachContext(variable);
    expect(toJsonCalls).toBe(0);

    expect(variable.mx.length).toBeUndefined();
    expect(toJsonCalls).toBe(0);

    expect(variable.value.text).toBe('{"name":"Ada"}');
    expect(toJsonCalls).toBe(1);
  });

  it('recursively discovers structured object URLs during variable creation without materializing text', () => {
    let toJsonCalls = 0;
    const wrapped = wrapStructured(
      {
        link: {
          url: 'https://example.com/a#frag'
        },
        toJSON() {
          toJsonCalls += 1;
          return { link: this.link };
        }
      },
      'object',
      undefined,
      {
        security: makeSecurityDescriptor({ labels: ['influenced'] })
      }
    );

    const variable = createStructuredValueVariable('payload', wrapped, SOURCE);

    expect(toJsonCalls).toBe(0);
    expect(variable.value.metadata?.security?.urls).toEqual(['https://example.com/a']);
    expect(variable.mx.urls).toEqual(['https://example.com/a']);
    expect(Object.getOwnPropertyDescriptor(variable.value, 'text')?.get).toBeTypeOf('function');
  });
});
