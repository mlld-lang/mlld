import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import type { DirectiveNode, SourceLocation } from '@core/types';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { asText } from '@interpreter/utils/structured-value';
import { evaluateRun } from './run';
import * as unifiedProcessor from './pipeline/unified-processor';
import * as proseExecution from './prose-execution';
import * as environmentProvider from '@interpreter/env/environment-provider';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createEnv(basePath: string = process.cwd()): Environment {
  const env = new Environment(new NodeFileSystem(), new PathService(), basePath);
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function listDirectives(ast: unknown): DirectiveNode[] {
  const nodes = Array.isArray(ast)
    ? ast
    : Array.isArray((ast as any)?.body)
      ? (ast as any).body
      : [];
  return nodes.filter((node: any) => node?.type === 'Directive') as DirectiveNode[];
}

function toSourceLocation(location: any): SourceLocation {
  if (!location) {
    return { line: 1, column: 1 };
  }
  const start = location.start ?? location;
  return {
    line: Number(start?.line ?? 1),
    column: Number(start?.column ?? 1),
    filePath: typeof location?.source === 'string' ? location.source : undefined
  };
}

function toRunDirective(node: DirectiveNode): DirectiveNode {
  return {
    ...node,
    location: node.location ?? toSourceLocation((node as any).location),
    meta: node.meta ?? {}
  } as DirectiveNode;
}

async function parseDirectives(source: string): Promise<DirectiveNode[]> {
  const { ast } = await parse(source);
  return listDirectives(ast);
}

async function setupSingleRun(source: string, env: Environment): Promise<DirectiveNode> {
  const directives = await parseDirectives(source);
  for (const directive of directives) {
    if (directive.kind !== 'run') {
      await evaluate(directive, env);
    }
  }
  const runDirective = directives.find(directive => directive.kind === 'run');
  if (!runDirective) {
    throw new Error('Expected one /run directive in test source');
  }
  return toRunDirective(runDirective);
}

describe('evaluateRun phase-0 characterization', () => {
  const tempPaths: string[] = [];
  const originalMaxSize = process.env.MLLD_MAX_SHELL_COMMAND_SIZE;

  afterEach(() => {
    process.env.MLLD_MAX_SHELL_COMMAND_SIZE = originalMaxSize;
    vi.restoreAllMocks();
    while (tempPaths.length > 0) {
      const tempPath = tempPaths.pop();
      if (tempPath) {
        fs.rmSync(tempPath, { recursive: true, force: true });
      }
    }
  });

  it('locks runCommand interpolation and operation-context metadata updates', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      '/var @cmd = "echo interpolated"\n/run cmd {@cmd}',
      env
    );

    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('interpolated');
    const context = {
      operationContext: {
        type: 'run',
        metadata: { fromTest: true }
      }
    } as unknown as EvaluationContext;

    const result = await evaluateRun(runDirective, env, [], context);

    expect(executeSpy).toHaveBeenCalledWith(
      'echo interpolated',
      undefined,
      expect.objectContaining({
        directiveType: 'run'
      })
    );
    expect(asText(result.value)).toBe('interpolated');

    const opCtx = (context.operationContext ?? {}) as any;
    expect(opCtx.command).toBe('echo interpolated');
    expect(opCtx.opLabels).toEqual(expect.arrayContaining(['op:cmd', 'op:cmd:echo', 'op:cmd:echo:interpolated']));
    expect(opCtx.sources).toEqual(expect.arrayContaining(['cmd:echo:interpolated']));
    expect(opCtx.metadata.commandPreview).toBe('echo interpolated');
  });

  it('keeps provider command execution path wiring stable', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {echo provider}', env);

    vi.spyOn(environmentProvider, 'resolveEnvironmentConfig').mockReturnValue({ provider: '@mock-provider' } as any);
    vi.spyOn(environmentProvider, 'applyEnvironmentDefaults').mockImplementation((config: any) => config);
    const providerSpy = vi
      .spyOn(environmentProvider, 'executeProviderCommand')
      .mockResolvedValue({ stdout: 'provider-output' } as any);
    const localExecuteSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('local-output');

    const result = await evaluateRun(runDirective, env);

    expect(providerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        providerRef: '@mock-provider',
        command: 'echo provider'
      })
    );
    expect(localExecuteSpy).not.toHaveBeenCalled();
    expect(asText(result.value)).toBe('provider-output');
  });

  it('keeps command policy denial behavior stable', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:echo:*"],',
        '    deny: ["cmd:echo:blocked"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run cmd {echo blocked}'
      ].join('\n'),
      env
    );

    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('should-not-run');

    await expect(evaluateRun(runDirective, env)).rejects.toThrow("Command 'echo' denied by policy");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('enforces hierarchical op:cmd policy patterns with most-specific precedence', async () => {
    const deniedEnv = createEnv();
    const deniedRun = await setupSingleRun(
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["op:cmd:git:status"],',
        '    deny: ["op:cmd:git"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run cmd {git add file.txt}'
      ].join('\n'),
      deniedEnv
    );

    const deniedSpy = vi.spyOn(deniedEnv, 'executeCommand').mockResolvedValue('should-not-run');

    await expect(evaluateRun(deniedRun, deniedEnv)).rejects.toThrow("Command 'git' denied by policy");
    expect(deniedSpy).not.toHaveBeenCalled();

    const allowedEnv = createEnv();
    const allowedRun = await setupSingleRun(
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["op:cmd:git:status"],',
        '    deny: ["op:cmd:git"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run cmd {git status}'
      ].join('\n'),
      allowedEnv
    );

    const allowedSpy = vi.spyOn(allowedEnv, 'executeCommand').mockResolvedValue('allowed-status');

    const allowedResult = await evaluateRun(allowedRun, allowedEnv);
    expect(asText(allowedResult.value)).toBe('allowed-status');
    expect(allowedSpy).toHaveBeenCalled();
  });

  it('blocks command execution when analyzer reports blocked risk', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {echo safe}', env);

    const analyze = vi.fn(async () => ({
      command: 'echo safe',
      baseCommand: 'echo',
      args: ['safe'],
      risks: [{
        type: 'DANGEROUS_COMMAND',
        severity: 'BLOCKED',
        description: 'blocked by characterization test'
      }],
      suspicious: true,
      blocked: true,
      requiresApproval: false
    }));

    (env as any).securityManager = { commandAnalyzer: { analyze } };
    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('should-not-run');

    await expect(evaluateRun(runDirective, env)).rejects.toThrow('Security: Command blocked - blocked by characterization test');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('enforces command-size guard before execution', async () => {
    process.env.MLLD_MAX_SHELL_COMMAND_SIZE = '8';

    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {echo tiny}', env);
    const executeSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('should-not-run');

    const context = {
      extractedInputs: [{ name: '__run_command__', value: 'echo this-is-too-large' }]
    } as unknown as EvaluationContext;

    await expect(evaluateRun(runDirective, env, [], context)).rejects.toThrow('Command payload too large for /run execution');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('resolves stdin from withClause.stdin expressions', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {cat} with { stdin: "stdin-value" }', env);

    const executeSpy = vi
      .spyOn(env, 'executeCommand')
      .mockImplementation(async (_command, options) => String(options?.input ?? ''));

    const result = await evaluateRun(runDirective, env);

    expect(executeSpy).toHaveBeenCalledWith(
      'cat',
      expect.objectContaining({ input: 'stdin-value' }),
      expect.any(Object)
    );
    expect(asText(result.value)).toBe('stdin-value');
  });

  it('prefers pre-extracted stdin over withClause.stdin evaluation', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {cat} with { stdin: @missingInput }', env);

    const executeSpy = vi
      .spyOn(env, 'executeCommand')
      .mockImplementation(async (_command, options) => String(options?.input ?? ''));

    const context = {
      extractedInputs: [{ name: '__run_stdin__', value: 'stdin-from-extracted' }]
    } as unknown as EvaluationContext;

    const result = await evaluateRun(runDirective, env, [], context);

    expect(executeSpy).toHaveBeenCalledWith(
      'cat',
      expect.objectContaining({ input: 'stdin-from-extracted' }),
      expect.any(Object)
    );
    expect(asText(result.value)).toBe('stdin-from-extracted');
  });

  it('extracts runCode args and auto-unwraps content-loader values', async () => {
    const env = createEnv();
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp/run-code-char-'));
    tempPaths.push(tempDir);
    const tempFile = path.join(tempDir, 'input.txt');
    fs.writeFileSync(tempFile, 'wrapped-file-content', 'utf8');

    const relativePath = path.relative(process.cwd(), tempFile).replace(/\\/g, '/');
    const runDirective = await setupSingleRun(
      `/var @file = <${relativePath}>\n/run js(@file) { return file; }`,
      env
    );

    const executeCodeSpy = vi
      .spyOn(env, 'executeCode')
      .mockImplementation(async (_code, _language, params) => String((params as any).file ?? ''));

    const result = await evaluateRun(runDirective, env);

    expect(executeCodeSpy).toHaveBeenCalled();
    const params = executeCodeSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(params.file).toBe('wrapped-file-content');
    expect(asText(result.value)).toBe('wrapped-file-content');
  });

  it('updates operation context for runCode capability mapping', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run js { return "ok"; }', env);

    vi.spyOn(env, 'executeCode').mockResolvedValue('ok');
    const context = {
      operationContext: {
        type: 'run',
        metadata: {}
      }
    } as unknown as EvaluationContext;

    const result = await evaluateRun(runDirective, env, [], context);

    const opCtx = (context.operationContext ?? {}) as any;
    expect(opCtx.subtype).toBe('js');
    expect(opCtx.opLabels).toEqual(expect.arrayContaining(['op:js']));
    expect(opCtx.sources).toEqual(expect.arrayContaining(['js']));
    expect(asText(result.value)).toBe('ok');
  });

  it('keeps runCode policy denial behavior stable', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    deny: ["js"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run js { return 1 }'
      ].join('\n'),
      env
    );

    const executeCodeSpy = vi.spyOn(env, 'executeCode').mockResolvedValue('should-not-run');

    await expect(evaluateRun(runDirective, env)).rejects.toThrow('JavaScript access denied by policy');
    expect(executeCodeSpy).not.toHaveBeenCalled();
  });

  it('keeps runCode primitive argument fallback behavior stable', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run js { return arg0; }', env);
    (runDirective.values as any).args = ['fallback-literal'];

    const executeCodeSpy = vi
      .spyOn(env, 'executeCode')
      .mockImplementation(async (_code, _language, params) => String((params as any).arg0 ?? ''));

    const result = await evaluateRun(runDirective, env);

    expect(executeCodeSpy).toHaveBeenCalled();
    expect(executeCodeSpy.mock.calls[0][2]).toEqual(expect.objectContaining({ arg0: 'fallback-literal' }));
    expect(asText(result.value)).toBe('fallback-literal');
  });

  it('keeps runExec builtin-transformer invocation behavior stable for field-access variants', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run @parse.strict("{\"count\":2}")', env);

    await expect(evaluateRun(runDirective, env)).rejects.toThrow('input.trim is not a function');
  });

  it('keeps runExec field-access errors stable for missing variants', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run @parse.missing("{}")', env);

    await expect(evaluateRun(runDirective, env)).rejects.toThrow("Pipeline function '@parse.missing' is not defined");
  });

  it('keeps runExec commandRef recursion behavior and circular-call detection', async () => {
    const successEnv = createEnv();
    const successRun = await setupSingleRun(
      [
        '/exe @base() = js { return "base" }',
        '/exe @alias() = @base()',
        '/run @alias()'
      ].join('\n'),
      successEnv
    );

    await expect(evaluateRun(successRun, successEnv)).rejects.toThrow(
      'Run exec directive identifier must be a command reference'
    );

    const circularEnv = createEnv();
    const circularRun = await setupSingleRun(
      [
        '/exe @a() = @a()',
        '/run @a()'
      ].join('\n'),
      circularEnv
    );

    await expect(evaluateRun(circularRun, circularEnv, ['a'])).rejects.toThrow(
      'Circular command reference detected: a -> a'
    );
  });

  it('keeps runExec definition dispatch behavior for command, code, template, and prose', async () => {
    const env = createEnv();
    const proseSpy = vi
      .spyOn(proseExecution, 'executeProseExecutable')
      .mockResolvedValue('prose:result');

    const commandProgram = [
      '/exe @cmdFn() = cmd {echo command-path}',
      '/run @cmdFn()'
    ].join('\n');
    const commandRun = await setupSingleRun(commandProgram, env);
    vi.spyOn(env, 'executeCommand').mockResolvedValueOnce('command:result');
    const commandResult = await evaluateRun(commandRun, env);

    expect(asText(commandResult.value)).toBe('command:result');

    const codeProgram = [
      '/exe @codeFn(v) = js { return v.toUpperCase(); }',
      '/run @codeFn("abc")'
    ].join('\n');
    const codeRun = await setupSingleRun(codeProgram, env);
    vi.spyOn(env, 'executeCode').mockResolvedValueOnce('ABC');
    const codeResult = await evaluateRun(codeRun, env);

    expect(asText(codeResult.value)).toBe('ABC');

    const templateProgram = [
      '/exe @tplFn(v) = `tpl:@v`',
      '/run @tplFn("x")'
    ].join('\n');
    const templateRun = await setupSingleRun(templateProgram, env);
    const templateResult = await evaluateRun(templateRun, env);

    expect(asText(templateResult.value)).toBe('tpl:x');

    const proseProgram = [
      '/exe @proseFn(topic) = prose:@noop { summarize @topic }',
      '/run @proseFn("mlld")'
    ].join('\n');
    const proseRun = await setupSingleRun(proseProgram, env);
    const proseResult = await evaluateRun(proseRun, env);

    expect(proseSpy).toHaveBeenCalled();
    expect(asText(proseResult.value)).toBe('prose:result');
  });

  it('passes inline object literals through /run executable parameters', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/exe @test(a, b, data) = [',
        '  => `a=@a b=@b data=@data`',
        ']',
        '/run @test("x", "y", { count: 5 })'
      ].join('\n'),
      env
    );

    const result = await evaluateRun(runDirective, env);
    expect(asText(result.value)).toContain('a=x b=y data={"count":5}');
  });

  it('preserves object parameters for spread in /run exe blocks', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/exe @merge(data) = [',
        '  let @result = { ts: @now, ...@data }',
        '  => @result',
        ']',
        '/var @info = { count: 5 }',
        '/run @merge(@info)'
      ].join('\n'),
      env
    );

    const result = await evaluateRun(runDirective, env);
    const output = asText(result.value);
    expect(output).toContain('"count":5');
    expect(output).toContain('"ts":"');
  });

  it('passes structured objects to js run executables', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/exe @inspect(data) = js {',
        '  return JSON.stringify({ kind: typeof data, count: data?.count ?? null });',
        '}',
        '/run @inspect({ count: 5 })'
      ].join('\n'),
      env
    );

    const result = await evaluateRun(runDirective, env);
    const output = asText(result.value);
    expect(output).toContain('"kind":"object"');
    expect(output).toContain('"count":5');
  });

  it('keeps stage-0 retry eligibility behavior between non-retryable and retryable run sources', async () => {
    const nonRetryableEnv = createEnv();
    const nonRetryableRun = await setupSingleRun(
      [
        '/exe @retryer(input, pipeline) = js { return "retry"; }',
        '/run cmd {echo seed} with { pipeline: [@retryer(@p)] }'
      ].join('\n'),
      nonRetryableEnv
    );

    vi.spyOn(nonRetryableEnv, 'executeCommand').mockResolvedValue('seed');

    const nonRetryableResult = await evaluateRun(nonRetryableRun, nonRetryableEnv);
    expect(asText(nonRetryableResult.value)).toBe('seed');

    const retryableEnv = createEnv();
    const retryableRun = await setupSingleRun(
      [
        '/exe @seed() = js { return "seed" }',
        '/exe @retryer(input, pipeline) = js { return pipeline.try < 2 ? "retry" : String(pipeline.try) + ":" + input; }',
        '/run @seed().includes("ee") with { pipeline: [@retryer(@p)] }'
      ].join('\n'),
      retryableEnv
    );

    const retryableResult = await evaluateRun(retryableRun, retryableEnv);
    expect(asText(retryableResult.value)).toBe('2:2:true');
  });

  it('passes descriptor hints into processPipeline when withClause.pipeline is applied', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      [
        '/exe @id(input) = js { return input }',
        '/run cmd {echo hint} with { pipeline: [@id] }'
      ].join('\n'),
      env
    );

    vi.spyOn(env, 'executeCommand').mockResolvedValue('hint');
    const processSpy = vi.spyOn(unifiedProcessor, 'processPipeline');

    await evaluateRun(runDirective, env);

    expect(processSpy).toHaveBeenCalled();
    const pipelineContext = processSpy.mock.calls[0][0] as any;
    expect(Array.isArray(pipelineContext.pipeline)).toBe(true);
    expect(pipelineContext.descriptorHint).toBeDefined();
    expect(pipelineContext.descriptorHint.taint).toEqual(expect.arrayContaining(['src:exec']));
  });

  it('keeps streaming streamFormat finalization and effect-emission gating stable', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun(
      '/run cmd {echo raw} with { stream: true, streamFormat: "json" }',
      env
    );

    vi.spyOn(env, 'executeCommand').mockResolvedValue('raw');
    const manager = env.getStreamingManager();
    vi.spyOn(manager, 'finalizeResults').mockReturnValue({
      streaming: { text: '{"formatted":true}' } as any
    });

    const result = await evaluateRun(runDirective, env);

    expect(asText(result.value)).toBe('{"formatted":true}');
    expect(env.getStreamingResult()?.text).toBe('{"formatted":true}');

    const handler = env.getEffectHandler() as TestEffectHandler;
    const bothEffects = handler.getEffects().filter(effect => effect.type === 'both');
    expect(bothEffects).toHaveLength(0);
  });

  it('keeps effect emission enabled for non-streamFormat run output', async () => {
    const env = createEnv();
    const runDirective = await setupSingleRun('/run cmd {echo visible}', env);

    vi.spyOn(env, 'executeCommand').mockResolvedValue('visible');

    const result = await evaluateRun(runDirective, env);

    expect(asText(result.value)).toBe('visible');
    const handler = env.getEffectHandler() as TestEffectHandler;
    const bothEffects = handler.getEffects().filter(effect => effect.type === 'both');
    expect(bothEffects).toHaveLength(1);
    expect(bothEffects[0].content).toBe('visible\n');
  });

  it('executes runExecReference actions without changing output contract', async () => {
    const env = createEnv();
    const directives = await parseDirectives([
      '/exe @seed() = js { return "seed" }',
      '/when true => run @seed().includes("ee")'
    ].join('\n'));

    const exeDirective = directives.find(directive => directive.kind === 'exe');
    const whenDirective = directives.find(directive => directive.kind === 'when');

    if (!exeDirective || !whenDirective) {
      throw new Error('Expected exe and when directives for runExecReference test');
    }

    await evaluate(exeDirective, env);

    const actionNodes = ((whenDirective.values as any)?.action ?? []) as DirectiveNode[];
    const runAction = actionNodes.find(node => node.type === 'Directive' && node.kind === 'run');

    if (!runAction) {
      throw new Error('Expected run action in when directive');
    }

    const result = await evaluateRun(toRunDirective(runAction), env);
    expect(asText(result.value)).toBe('true');
  });
});
