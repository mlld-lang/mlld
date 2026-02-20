import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { ExecutableDefinition, ExecutableVariable } from '@core/types/executable';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import {
  dispatchRunExecutableDefinition,
  extractRunExecArguments,
  type RunExecDefinitionDispatchParams,
  type RunExecDispatcherServices
} from './run-exec-definition-dispatcher';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { executeProseExecutable } from '@interpreter/eval/prose-execution';
import { parse } from '@grammar/parser';

vi.mock('@interpreter/eval/exec-invocation', () => ({
  evaluateExecInvocation: vi.fn()
}));

vi.mock('@interpreter/eval/prose-execution', () => ({
  executeProseExecutable: vi.fn()
}));

function createEnv(basePath: string = process.cwd()): Environment {
  const env = new Environment(new NodeFileSystem(), new PathService(), basePath);
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createDirective(args: unknown[] = []): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'run',
    subtype: 'runExec',
    source: 'exec',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          valueType: 'varIdentifier',
          identifier: 'tool'
        }
      ],
      args
    },
    meta: {}
  } as unknown as DirectiveNode;
}

function createExecutable(
  name: string,
  definition: ExecutableDefinition,
  internal: Record<string, unknown> = {}
): ExecutableVariable {
  return {
    type: 'executable',
    name,
    value: definition,
    source: {
      directive: 'var',
      syntax: 'code',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    mx: {},
    internal: {
      executableDef: definition,
      ...internal
    }
  } as ExecutableVariable;
}

function createServices(
  env: Environment,
  overrides: Partial<RunExecDispatcherServices> = {}
): RunExecDispatcherServices {
  return {
    interpolateWithPendingDescriptor:
      overrides.interpolateWithPendingDescriptor ??
      vi.fn(async (nodes: unknown) => {
        if (typeof nodes === 'string') {
          return nodes;
        }
        if (Array.isArray(nodes)) {
          return nodes
            .map(node => (node && typeof node === 'object' && 'content' in node ? String((node as any).content) : ''))
            .join('');
        }
        return '';
      }),
    evaluateRunRecursive:
      overrides.evaluateRunRecursive ??
      vi.fn(async () => ({
        value: 'recursive-value',
        env
      }))
  };
}

function buildParams(
  overrides: Partial<RunExecDefinitionDispatchParams> = {}
): RunExecDefinitionDispatchParams {
  const env = overrides.env ?? createEnv();
  const definition =
    overrides.definition ??
    ({
      type: 'template',
      template: [{ type: 'Text', content: 'template-default' }],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition);
  const execVar = overrides.execVar ?? createExecutable('tool', definition);
  return {
    directive: overrides.directive ?? createDirective(),
    env,
    context: overrides.context,
    withClause: overrides.withClause,
    executionContext: overrides.executionContext ?? { directiveType: 'run' },
    streamingEnabled: overrides.streamingEnabled ?? false,
    pipelineId: overrides.pipelineId ?? 'run-exec-dispatch',
    policyEnforcer: overrides.policyEnforcer ?? new PolicyEnforcer(env.getPolicySummary()),
    policyChecksEnabled: overrides.policyChecksEnabled ?? true,
    definition,
    execVar,
    callStack: overrides.callStack ?? [],
    argValues: overrides.argValues ?? {},
    argRuntimeValues: overrides.argRuntimeValues ?? {},
    argDescriptors: overrides.argDescriptors ?? [],
    exeLabels: overrides.exeLabels ?? [],
    services: overrides.services ?? createServices(env)
  };
}

describe('run exec definition dispatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts runtime objects for inline literal arguments', async () => {
    const env = createEnv();
    const definition = {
      type: 'code',
      codeTemplate: [{ type: 'Text', content: 'unused' }],
      language: 'mlld-exe-block',
      paramNames: ['a', 'b', 'data'],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const { ast } = await parse('/run @tool("x", "y", { count: 5 })');
    const directives = (Array.isArray(ast) ? ast : (ast as any).body ?? []) as DirectiveNode[];
    const directive = directives.find(node => node?.type === 'Directive' && node.kind === 'run') as DirectiveNode;

    const extracted = await extractRunExecArguments({
      directive,
      definition,
      env,
      interpolateWithPendingDescriptor: createServices(env).interpolateWithPendingDescriptor
    });

    expect(extracted.argValues).toMatchObject({
      a: 'x',
      b: 'y',
      data: '{"count":5}'
    });
    expect(extracted.argRuntimeValues.data).toEqual({ count: 5 });
  });

  it('dispatches command definitions through command execution path', async () => {
    const env = createEnv();
    const definition = {
      type: 'command',
      commandTemplate: [{ type: 'Text', content: 'echo command' }],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const executeCommandSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('command-output');
    const services = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async () => 'echo command')
    });
    const params = buildParams({
      env,
      definition,
      execVar: createExecutable('tool', definition),
      services
    });

    const result = await dispatchRunExecutableDefinition(params);

    expect(executeCommandSpy).toHaveBeenCalledWith(
      'echo command',
      undefined,
      expect.objectContaining({
        pipelineId: 'run-exec-dispatch'
      })
    );
    expect(result.value).toBe('command-output');
    expect(result.outputDescriptors.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves null runtime params for command interpolation and keeps literal "null" truthy', async () => {
    const env = createEnv();
    const definition = {
      type: 'command',
      commandTemplate: [{ type: 'Text', content: '@title?`@title `@name' }],
      paramNames: ['name', 'title'],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const executeCommandSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('command-output');
    const services = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async (_nodes, _context, targetEnv) => {
        const title = targetEnv?.getVariable('title')?.value;
        const name = targetEnv?.getVariable('name')?.value;
        return `${title ? `${title} ` : ''}${name ?? ''}`;
      })
    });

    await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition,
        execVar: createExecutable('tool', definition),
        argValues: { name: 'Ada', title: 'null' },
        argRuntimeValues: { name: 'Ada', title: null },
        services
      })
    );

    await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition,
        execVar: createExecutable('tool', definition),
        argValues: { name: 'Ada', title: 'null' },
        argRuntimeValues: { name: 'Ada', title: 'null' },
        services
      })
    );

    expect(executeCommandSpy).toHaveBeenNthCalledWith(
      1,
      'Ada',
      undefined,
      expect.objectContaining({
        pipelineId: 'run-exec-dispatch'
      })
    );
    expect(executeCommandSpy).toHaveBeenNthCalledWith(
      2,
      'null Ada',
      undefined,
      expect.objectContaining({
        pipelineId: 'run-exec-dispatch'
      })
    );
  });

  it('preserves command security block failures', async () => {
    const env = createEnv();
    const definition = {
      type: 'command',
      commandTemplate: [{ type: 'Text', content: 'echo blocked' }],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const analyze = vi.fn(async () => ({
      command: 'echo blocked',
      baseCommand: 'echo',
      args: ['blocked'],
      risks: [{ type: 'DANGEROUS_COMMAND', severity: 'BLOCKED', description: 'blocked by dispatcher test' }],
      suspicious: true,
      blocked: true,
      requiresApproval: false
    }));
    (env as any).securityManager = { commandAnalyzer: { analyze } };
    const executeCommandSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('should-not-run');
    const services = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async () => 'echo blocked')
    });

    await expect(
      dispatchRunExecutableDefinition(
        buildParams({
          env,
          definition,
          execVar: createExecutable('tool', definition),
          services
        })
      )
    ).rejects.toThrow('Security: Exec command blocked - blocked by dispatcher test');
    expect(executeCommandSpy).not.toHaveBeenCalled();
  });

  it('dispatches commandRef definitions for invocation AST and recursive fallback', async () => {
    const env = createEnv();
    const mockedEvaluateExecInvocation = vi.mocked(evaluateExecInvocation);
    mockedEvaluateExecInvocation.mockResolvedValue({ value: 'ast-output', env } as any);

    const astDefinition = {
      type: 'commandRef',
      commandRef: 'ignored',
      commandRefAst: { type: 'ExecInvocation', commandRef: { type: 'VariableReference', identifier: 'tool' } },
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const astResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: astDefinition,
        execVar: createExecutable('tool', astDefinition)
      })
    );
    expect(astResult.value).toBe('ast-output');
    expect(mockedEvaluateExecInvocation).toHaveBeenCalled();

    const recursiveDefinition = {
      type: 'commandRef',
      commandRef: 'next',
      commandArgs: [],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    env.setVariable('next', createExecutable('next', recursiveDefinition) as any);
    const recursiveEval = vi.fn(async () => ({ value: 'recursive-output', env }));
    const recursiveResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: recursiveDefinition,
        execVar: createExecutable('tool', recursiveDefinition),
        services: createServices(env, { evaluateRunRecursive: recursiveEval })
      })
    );
    expect(recursiveResult.value).toBe('recursive-output');
    expect(recursiveEval).toHaveBeenCalled();
  });

  it('preserves circular commandRef detection and builtin keychain argument failures', async () => {
    const env = createEnv();
    const recursiveDefinition = {
      type: 'commandRef',
      commandRef: 'next',
      commandArgs: [],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    env.setVariable('next', createExecutable('next', recursiveDefinition) as any);

    await expect(
      dispatchRunExecutableDefinition(
        buildParams({
          env,
          definition: recursiveDefinition,
          execVar: createExecutable('tool', recursiveDefinition),
          callStack: ['next']
        })
      )
    ).rejects.toThrow('Circular command reference detected: next -> next');

    const builtinDefinition = {
      type: 'code',
      codeTemplate: [{ type: 'Text', content: 'return value;' }],
      language: 'js',
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const builtinExec = createExecutable('keychainGet', builtinDefinition, {
      isBuiltinTransformer: true,
      keychainFunction: 'get',
      transformerImplementation: vi.fn(async () => null)
    });
    await expect(
      dispatchRunExecutableDefinition(
        buildParams({
          env,
          directive: createDirective(['service-only']),
          definition: builtinDefinition,
          execVar: builtinExec
        })
      )
    ).rejects.toThrow('Keychain access requires service and account');
  });

  it('dispatches builtin transformers through transformer implementation', async () => {
    const env = createEnv();
    const definition = {
      type: 'code',
      codeTemplate: [{ type: 'Text', content: 'return value;' }],
      language: 'js',
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const transformerImplementation = vi.fn(async (args: unknown[]) => `transformed:${String(args[0])}`);
    const execVar = createExecutable('builtin', definition, {
      isBuiltinTransformer: true,
      transformerImplementation
    });

    const result = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        directive: createDirective(['value']),
        definition,
        execVar
      })
    );

    expect(transformerImplementation).toHaveBeenCalledWith(['value']);
    expect(result.value).toBe('transformed:value');
  });

  it('dispatches code definitions and preserves mlld-when failure path', async () => {
    const env = createEnv();
    const executeCodeSpy = vi.spyOn(env, 'executeCode').mockResolvedValue('code-output');
    const definition = {
      type: 'code',
      codeTemplate: [{ type: 'Text', content: 'return "ok";' }],
      language: 'js',
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const services = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async () => 'return "ok";')
    });
    const result = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition,
        execVar: createExecutable('tool', definition),
        services
      })
    );

    expect(executeCodeSpy).toHaveBeenCalled();
    expect(result.value).toBe('code-output');

    const badWhenDefinition = {
      type: 'code',
      codeTemplate: [{ type: 'Text', content: 'not-a-when-node' }],
      language: 'mlld-when',
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    await expect(
      dispatchRunExecutableDefinition(
        buildParams({
          env,
          definition: badWhenDefinition,
          execVar: createExecutable('badWhen', badWhenDefinition)
        })
      )
    ).rejects.toThrow('mlld-when executable missing WhenExpression node');
  });

  it('dispatches template and prose definitions', async () => {
    const env = createEnv();
    const mockedExecuteProseExecutable = vi.mocked(executeProseExecutable);
    mockedExecuteProseExecutable.mockResolvedValue('prose-output');

    const templateDefinition = {
      type: 'template',
      template: [{ type: 'Text', content: 'template body' }],
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const templateServices = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async () => 'template-output')
    });
    const templateResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: templateDefinition,
        execVar: createExecutable('templateExec', templateDefinition),
        services: templateServices
      })
    );
    expect(templateResult.value).toBe('template-output');

    const proseDefinition = {
      type: 'prose',
      prompt: [{ type: 'Text', content: 'summarize @topic' }],
      configRef: '@noop',
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const proseResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: proseDefinition,
        execVar: createExecutable('proseExec', proseDefinition)
      })
    );
    expect(mockedExecuteProseExecutable).toHaveBeenCalled();
    expect(proseResult.value).toBe('prose-output');
  });

  it('preserves null runtime params for template interpolation and keeps literal "null" truthy', async () => {
    const env = createEnv();
    const templateDefinition = {
      type: 'template',
      template: [{ type: 'Text', content: '@title?`@title `@name' }],
      paramNames: ['name', 'title'],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;
    const templateServices = createServices(env, {
      interpolateWithPendingDescriptor: vi.fn(async (_nodes, _context, targetEnv) => {
        const title = targetEnv?.getVariable('title')?.value;
        const name = targetEnv?.getVariable('name')?.value;
        return `${title ? `${title} ` : ''}${name ?? ''}`;
      })
    });

    const nullResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: templateDefinition,
        execVar: createExecutable('templateExec', templateDefinition),
        argValues: { name: 'Ada', title: 'null' },
        argRuntimeValues: { name: 'Ada', title: null },
        services: templateServices
      })
    );

    const stringNullResult = await dispatchRunExecutableDefinition(
      buildParams({
        env,
        definition: templateDefinition,
        execVar: createExecutable('templateExec', templateDefinition),
        argValues: { name: 'Ada', title: 'null' },
        argRuntimeValues: { name: 'Ada', title: 'null' },
        services: templateServices
      })
    );

    expect(nullResult.value).toBe('Ada');
    expect(stringNullResult.value).toBe('null Ada');
  });

  it('preserves unsupported definition errors', async () => {
    const env = createEnv();
    const unsupportedDefinition = {
      type: 'data',
      payload: { value: 1 },
      paramNames: [],
      sourceDirective: 'exec'
    } as unknown as ExecutableDefinition;

    await expect(
      dispatchRunExecutableDefinition(
        buildParams({
          env,
          definition: unsupportedDefinition,
          execVar: createExecutable('unsupported', unsupportedDefinition)
        })
      )
    ).rejects.toThrow('Unsupported executable type: data');
  });
});
