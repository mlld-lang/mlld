import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { createObjectVariable } from '@core/types/variable';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const OBJECT_SOURCE = {
  directive: 'var' as const,
  syntax: 'object' as const,
  hasInterpolation: false,
  isMultiLine: false
};

interface EnvWithEffects {
  env: Environment;
}

function createEnv(): EnvWithEffects {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  return { env };
}

function variableReferenceNode(
  identifier: string,
  options?: {
    fields?: Array<{ type: 'field'; value: string }>;
    valueType?: string;
    args?: unknown[];
  }
): any {
  return {
    type: 'VariableReference',
    nodeId: `${identifier}-ref`,
    identifier,
    valueType: options?.valueType ?? 'varIdentifier',
    ...(options?.fields ? { fields: options.fields } : {}),
    ...(options?.args ? { args: options.args } : {})
  };
}

describe('interpreter variable reference resolver', () => {
  it('resolves nested field access paths', async () => {
    const { env } = createEnv();
    env.setVariable(
      'profile',
      createObjectVariable(
        'profile',
        { user: { name: 'Ada' } },
        true,
        OBJECT_SOURCE
      )
    );

    const result = await evaluate(
      variableReferenceNode('profile', {
        fields: [
          { type: 'field', value: 'user' },
          { type: 'field', value: 'name' }
        ]
      }),
      env
    );

    expect(result.value).toBe('Ada');
  });

  it('returns null for missing fields in non-condition contexts', async () => {
    const { env } = createEnv();
    env.setVariable(
      'profile',
      createObjectVariable(
        'profile',
        { user: { name: 'Ada' } },
        true,
        OBJECT_SOURCE
      )
    );

    const result = await evaluate(
      variableReferenceNode('profile', {
        fields: [
          { type: 'field', value: 'user' },
          { type: 'field', value: 'missing' }
        ]
      }),
      env,
      { isExpression: true }
    );

    expect(result.value).toBeNull();
  });

  it('applies condensed pipeline tails in order', async () => {
    const { env } = createEnv();
    await evaluate(
      parseSync(`
/var @name = "ada"
/exe @upper(input) = js { return input.toUpperCase(); }
/exe @suffix(input) = js { return input + '!'; }
      `),
      env
    );

    const showDirective = parseSync('/show @name | @upper | @suffix')[0] as any;
    const invocation = showDirective.values.invocation;
    const result = await evaluate(invocation, env, { isExpression: true });

    expect(isStructuredValue(result.value)).toBe(true);
    expect(asText(result.value as any)).toBe('ADA!');
  });

  it('executes commandRef-style variable references', async () => {
    const { env } = createEnv();
    env.setVariable('ping', {
      type: 'executable',
      name: 'ping',
      value: {
        type: 'code',
        codeTemplate: [
          {
            type: 'Text',
            nodeId: 'ping-template',
            content: 'return "pong";'
          }
        ],
        language: 'javascript'
      }
    } as any);

    const result = await evaluate(
      variableReferenceNode('ping', {
        valueType: 'commandRef',
        args: []
      }),
      env
    );

    expect(result.value).toBe('pong');
    expect(result.stdout).toBe('pong');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('returns undefined for missing variables in expression context', async () => {
    const { env } = createEnv();
    const result = await evaluate(
      variableReferenceNode('missingVar'),
      env,
      { isExpression: true }
    );
    expect(result.value).toBeUndefined();
  });
});
