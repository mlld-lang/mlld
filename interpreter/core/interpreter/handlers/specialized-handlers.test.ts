import { describe, expect, it, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import { createObjectVariable } from '@core/types/variable';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import {
  asText,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';
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
  fs: MemoryFileSystem;
  effects: TestEffectHandler;
}

function createEnv(): EnvWithEffects {
  const fs = new MemoryFileSystem();
  const env = new Environment(fs, new PathService(), '/');
  const effects = new TestEffectHandler();
  env.setEffectHandler(effects);
  return { env, fs, effects };
}

function parseVarValueNode(source: string): any {
  const directive = parseSync(source)[0] as any;
  return directive.values.value[0];
}

function parseShowInvocation(source: string): any {
  const directive = parseSync(source)[0] as any;
  return directive.values.invocation;
}

function variableReferenceNode(identifier: string): any {
  return {
    type: 'VariableReference',
    nodeId: `${identifier}-ref`,
    identifier,
    valueType: 'varIdentifier'
  };
}

function literalNode(
  value: string | number | boolean,
  valueType: string
): any {
  return {
    type: 'Literal',
    nodeId: `literal-${valueType}`,
    value,
    valueType
  };
}

function resultShape(result: { value: unknown; stdout?: string; stderr?: string; exitCode?: number }): Record<string, unknown> {
  const valueKind = isStructuredValue(result.value)
    ? `structured:${result.value.type}`
    : result.value === null
      ? 'null'
      : Array.isArray(result.value)
        ? 'array'
        : typeof result.value;
  return {
    valueKind,
    hasStdout: typeof result.stdout === 'string',
    hasStderr: typeof result.stderr === 'string',
    hasExitCode: typeof result.exitCode === 'number'
  };
}

function asBestText(value: unknown): string {
  if (isStructuredValue(value)) {
    return asText(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function docContents(effects: TestEffectHandler): string[] {
  return effects
    .getEffects()
    .filter(effect => effect.type === 'doc')
    .map(effect => effect.content);
}

describe('interpreter specialized handlers parity', () => {
  it('execInvocation handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    await evaluate(
      parseSync('/exe @upper(input) = js { return String(input).toUpperCase(); }'),
      env
    );
    const invocation = parseShowInvocation('/show @upper("ada")');
    const result = await evaluate(invocation, env, { isExpression: true });

    expect(asBestText(result.value)).toBe('ADA');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": true,
        "hasStderr": true,
        "hasStdout": true,
        "valueKind": "structured:text",
      }
    `);

    const missingInvocation = parseShowInvocation('/show @missingCmd()');
    await expect(
      evaluate(missingInvocation, env, { isExpression: true })
    ).rejects.toThrow(/missingCmd/i);
  });

  it('variableReferenceWithTail handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    await evaluate(
      parseSync(`
/var @name = "ada"
/exe @upper(input) = js { return String(input).toUpperCase(); }
      `),
      env
    );

    const withTail = parseShowInvocation('/show @name with { pipeline: [@upper] }');
    const result = await evaluate(withTail, env, { isExpression: true });
    expect(asBestText(result.value)).toBe('ADA');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "structured:text",
      }
    `);

    const missingWithTail = parseShowInvocation('/show @missing with { pipeline: [@upper] }');
    await expect(
      evaluate(missingWithTail, env, { isExpression: true })
    ).rejects.toThrow(/missing/i);
  });

  it('newExpression handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    env.setVariable(
      'sandbox',
      createObjectVariable('sandbox', { kind: 'demo' }, false, OBJECT_SOURCE)
    );

    const node = {
      type: 'NewExpression',
      nodeId: 'new-expression-node',
      target: variableReferenceNode('sandbox'),
      args: []
    };
    const result = await evaluate(node as any, env, { isExpression: true });

    expect(result.value).toEqual({ kind: 'demo' });
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "object",
      }
    `);

    const missingNode = {
      ...node,
      target: variableReferenceNode('missingBuilder')
    };
    await expect(
      evaluate(missingNode as any, env, { isExpression: true })
    ).rejects.toThrow(/missingBuilder/i);
  });

  it('labelModification handler keeps positive and privileged-context behavior stable', async () => {
    const { env } = createEnv();
    const addNode = {
      type: 'LabelModification',
      nodeId: 'label-add-node',
      modifiers: [{ kind: 'add', label: 'pii' }],
      value: [literalNode('alpha', 'string')]
    };

    const result = await evaluate(addNode as any, env, { isExpression: true });
    const descriptor = extractSecurityDescriptor(result.value);
    expect(descriptor?.labels).toContain('pii');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "structured:text",
      }
    `);

    const removeNode = {
      ...addNode,
      nodeId: 'label-remove-node',
      modifiers: [{ kind: 'remove', label: 'pii' }]
    };

    await expect(
      evaluate(removeNode as any, env, { isExpression: true })
    ).rejects.toThrow(/privilege/i);

    const privilegedResult = await evaluate(removeNode as any, env, {
      isExpression: true,
      privileged: true
    });
    expect(privilegedResult).toHaveProperty('value');
  });

  it('unifiedExpression handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    const equalNode = {
      type: 'BinaryExpression',
      nodeId: 'binary-eq',
      operator: '==',
      left: literalNode(1, 'number'),
      right: literalNode(1, 'number')
    };

    const result = await evaluate(equalNode as any, env, { isExpression: true });
    expect(result.value).toBe(true);
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "boolean",
      }
    `);

    const invalidNode = {
      ...equalNode,
      nodeId: 'binary-invalid',
      operator: '@@'
    };
    await expect(
      evaluate(invalidNode as any, env, { isExpression: true })
    ).rejects.toThrow(/Unknown binary operator/i);
  });

  it('whenExpression handler keeps positive, context, ordering, and negative behavior stable', async () => {
    const whenNode = parseVarValueNode('/var @res = when [ true => show "first"; none => show "second" ]');

    const docEval = createEnv();
    const docResult = await evaluate(whenNode, docEval.env);
    docEval.env.renderOutput();
    expect(docResult.value).toMatchObject({
      __whenEffect: 'show',
      text: 'first'
    });
    expect(docContents(docEval.effects)).toEqual([]);
    expect(resultShape(docResult)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "object",
      }
    `);

    const expressionEval = createEnv();
    await evaluate(whenNode, expressionEval.env, { isExpression: true });
    expressionEval.env.renderOutput();
    expect(docContents(expressionEval.effects)).toEqual([]);

    const invalidWhen = parseVarValueNode('/var @res = when [ none => 0; true => 1 ]');
    await expect(
      evaluate(invalidWhen, createEnv().env)
    ).rejects.toThrow(/none/i);
  });

  it('forExpression handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    const forNode = parseVarValueNode('/var @out = for @x in [1,2] => @x');
    const result = await evaluate(forNode, env, { isExpression: true });
    const rendered = JSON.stringify(result.value);
    expect(rendered).toContain('1');
    expect(rendered).toContain('2');
    expect(resultShape(result).valueKind).toMatch(/array|object|structured:array/);

    const invalidForNode = parseVarValueNode('/var @out = for @x in 1 => @x');
    await expect(
      evaluate(invalidForNode, env, { isExpression: true })
    ).rejects.toThrow(/for expects an array/i);
  });

  it('loopExpression handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    const loopNode = parseVarValueNode('/var @result = loop(10) [ let @count = (@input ?? 0) + 1 when @count >= 3 => done @count continue @count ]');
    const result = await evaluate(loopNode, env, { isExpression: true });

    expect(result.value).toBe(3);
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "number",
      }
    `);

    await evaluate(parseSync('/var @limit = "bad"'), env);
    const invalidLoopNode = parseVarValueNode('/var @result = loop(@limit) [ done ]');
    await expect(
      evaluate(invalidLoopNode, env, { isExpression: true })
    ).rejects.toThrow(/loop limit expects a number/i);
  });

  it('foreach handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    await evaluate(
      parseSync(`
/exe @echo(item) = js { return item; }
/var @colors = ["red", "green"]
      `),
      env
    );

    const foreachNode = parseVarValueNode('/var @res = foreach @echo(@colors)');
    const result = await evaluate(foreachNode, env, { isExpression: true });
    const items = Array.isArray(result.value) ? result.value : [];
    const textItems = items.map(item => asBestText(item));

    expect(textItems).toEqual(['red', 'green']);
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "array",
      }
    `);

    const missingForeachNode = parseVarValueNode('/var @res = foreach @missing(@colors)');
    await expect(
      evaluate(missingForeachNode, env, { isExpression: true })
    ).rejects.toThrow(/Command not found: missing/i);
  });

  it('load-content handler keeps positive and negative behavior stable', async () => {
    const { env, fs } = createEnv();
    await fs.writeFile('/demo.txt', 'hello world');
    const loadNode = parseVarValueNode('/var @file = <demo.txt>');

    const result = await evaluate(loadNode, env, { isExpression: true });
    expect(asBestText(result.value)).toContain('hello world');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "structured:text",
      }
    `);

    const missingLoadNode = parseVarValueNode('/var @missing = <missing.txt>');
    await expect(
      evaluate(missingLoadNode, env, { isExpression: true })
    ).rejects.toThrow(/File not found: missing\.txt/i);
  });

  it('fileReference handler keeps positive and negative behavior stable', async () => {
    const { env, fs } = createEnv();
    await fs.writeFile('/demo.json', '{"content":"hello world"}');
    const loadNode = parseVarValueNode('/var @file = <demo.json>');
    const fileRefNode = {
      type: 'FileReference',
      nodeId: 'file-ref-node',
      source: loadNode.source,
      fields: [{ type: 'field', value: 'content' }]
    };

    const result = await evaluate(fileRefNode as any, env, { isExpression: true });
    expect(asBestText(result.value)).toContain('hello world');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "structured:text",
      }
    `);

    const missingLoadNode = parseVarValueNode('/var @missing = <missing.json>');
    const missingFileRefNode = {
      ...fileRefNode,
      source: missingLoadNode.source
    };
    await expect(
      evaluate(missingFileRefNode as any, env, { isExpression: true })
    ).rejects.toThrow(/File not found: missing\.json/i);
  });

  it('code handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    const codeNode = parseVarValueNode('/var @x = js { return "ok"; }');
    const result = await evaluate(codeNode, env, { isExpression: true });

    expect(result.value).toBe('ok');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "string",
      }
    `);

    const invalidCodeNode = {
      type: 'code',
      language: 'totally-unknown-lang',
      code: 'return 1;'
    };
    await expect(
      evaluate(invalidCodeNode as any, env, { isExpression: true })
    ).rejects.toThrow(/Unsupported code language/i);
  });

  it('command handler keeps positive and negative behavior stable', async () => {
    const { env } = createEnv();
    const commandNode = parseVarValueNode('/var @x = cmd { echo hi }');
    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('mock-cmd-output');

    const result = await evaluate(commandNode, env, { isExpression: true });
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0].trim()).toBe('echo hi');
    expect(result.value).toBe('mock-cmd-output');
    expect(resultShape(result)).toMatchInlineSnapshot(`
      {
        "hasExitCode": false,
        "hasStderr": false,
        "hasStdout": false,
        "valueKind": "string",
      }
    `);
    executeSpy.mockRestore();

    const failingCommandNode = parseVarValueNode('/var @x = cmd { echo hi }');
    const failingSpy = vi.spyOn(env, 'executeCommand').mockRejectedValue(new Error('command failed'));
    await expect(
      evaluate(failingCommandNode, env, { isExpression: true })
    ).rejects.toThrow(/command failed/i);
    failingSpy.mockRestore();
  });
});
