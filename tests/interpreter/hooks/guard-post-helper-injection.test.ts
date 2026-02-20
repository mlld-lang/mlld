import { describe, expect, it } from 'vitest';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { createGuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import { makeSecurityDescriptor } from '@core/types/security';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import {
  attachPostGuardInputHelper,
  ensurePostPrefixHelper,
  ensurePostTagHelper,
  injectPostGuardHelpers
} from '@interpreter/hooks/guard-post-helper-injection';

const SIMPLE_SOURCE = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createSecretVariable(name: string, value: string): Variable {
  return createSimpleTextVariable(
    name,
    value,
    SIMPLE_SOURCE,
    {
      security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
    }
  );
}

function getHelperImplementation(variable: Variable | undefined): (args: readonly unknown[]) => unknown {
  const implementation = (variable as any)?.internal?.guardHelperImplementation;
  expect(typeof implementation).toBe('function');
  return implementation as (args: readonly unknown[]) => unknown;
}

describe('guard post helper injection', () => {
  it('attaches guard input helper members as non-enumerable properties', () => {
    const target = createSecretVariable('target', 'payload');
    const helper = createGuardInputHelper([
      createSecretVariable('a', 'one'),
      createSecretVariable('b', 'two')
    ]);

    attachPostGuardInputHelper(target, helper);

    const keys = Object.keys(target as object);
    expect(keys).not.toContain('any');
    expect(keys).not.toContain('all');
    expect(keys).not.toContain('none');
    expect(keys).not.toContain('totalTokens');
    expect(keys).not.toContain('maxTokens');

    const anyDescriptor = Object.getOwnPropertyDescriptor(target as object, 'any');
    expect(anyDescriptor?.enumerable).toBe(false);
    expect(anyDescriptor?.configurable).toBe(true);
    expect(anyDescriptor?.writable).toBe(false);

    expect((target as any).any).toBe(helper.any);
    expect((target as any).all).toBe(helper.all);
    expect((target as any).none).toBe(helper.none);
  });

  it('injects complete op/input helper contracts with stable semantics', () => {
    const env = createEnv();
    injectPostGuardHelpers(env, {
      operation: {
        type: 'show',
        subtype: 'show',
        name: 'preview',
        opLabels: ['op:show']
      },
      labels: ['secret'],
      operationLabels: ['op:show']
    });

    const opIs = getHelperImplementation(env.getVariable('opIs'));
    const opHas = getHelperImplementation(env.getVariable('opHas'));
    const opHasAny = getHelperImplementation(env.getVariable('opHasAny'));
    const opHasAll = getHelperImplementation(env.getVariable('opHasAll'));
    const inputHas = getHelperImplementation(env.getVariable('inputHas'));

    expect(opIs(['show'])).toBe(true);
    expect(opHas(['op:show'])).toBe(true);
    expect(opHasAny([['op:other', 'op:show']])).toBe(true);
    expect(opHasAll([['op:show']])).toBe(true);
    expect(inputHas(['secret'])).toBe(true);
  });

  it('keeps helper fallback behavior for existing tagValue bindings and generated prefix/tag helpers', () => {
    const sourceEnv = createEnv();
    const targetEnv = createEnv();

    const existingTag = createExecutableVariable(
      'tagValue',
      'code',
      '',
      [],
      'javascript',
      SIMPLE_SOURCE,
      { internal: { isSystem: true } }
    );
    sourceEnv.setVariable('tagValue', existingTag);

    ensurePostTagHelper(sourceEnv, targetEnv);
    expect(targetEnv.getVariable('tagValue')).toBe(existingTag);

    const generatedPrefixEnv = createEnv();
    const generatedTagEnv = createEnv();
    ensurePostPrefixHelper(sourceEnv, generatedPrefixEnv);
    ensurePostTagHelper(createEnv(), generatedTagEnv);

    const prefixImpl = getHelperImplementation(generatedPrefixEnv.getVariable('prefixWith'));
    const tagImpl = getHelperImplementation(generatedTagEnv.getVariable('tagValue'));

    expect(prefixImpl(['wrapped', 'value'])).toBe('wrapped:value');
    expect(tagImpl(['after', 'payload', null])).toBe('after:payload');
  });
});
