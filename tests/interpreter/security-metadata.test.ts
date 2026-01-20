import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateVar } from '@interpreter/eval/var';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateExe } from '@interpreter/eval/exe';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { VariableMetadataUtils } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { processPipeline } from '@interpreter/eval/pipeline/unified-processor';
import type { PipelineCommand } from '@core/types/run';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { evaluateOutput } from '@interpreter/eval/output';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { evaluateShow } from '@interpreter/eval/show';
import { createSimpleTextVariable } from '@core/types/variable';
import { getAllDirsInPath } from '@core/security/paths';
import { MlldSecurityError } from '@core/errors';

describe('Security metadata propagation', () => {
  it('attaches descriptors when evaluating /var directives', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const directive = parseSync('/var secret,untrusted @foo = "value"')[0] as DirectiveNode;

    await evaluateVar(directive, env);

    const variable = env.getVariable('foo');
    expect(variable?.mx).toBeDefined();
    expect(variable?.mx.labels).toEqual(['secret', 'untrusted']);
  });

  it('restores serialized metadata during import reconstruction', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const serialized = VariableMetadataUtils.serializeSecurityMetadata({
      security: makeSecurityDescriptor({ labels: ['pii'] })
    });

    const variable = importer.createVariableFromValue('foo', 'bar', '/module', undefined, {
      serializedMetadata: serialized,
      securityLabels: ['secret']
    });

    expect(variable.mx.labels).toEqual(['secret']);
  });

  it('propagates descriptors through pipeline stages', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const descriptor = makeSecurityDescriptor({ labels: ['secret'] });
    const variable = createSimpleTextVariable('input', '  hello  ', source, { security: descriptor });
    const pipelineStage: PipelineCommand = {
      rawIdentifier: '__identity__',
      identifier: [
        { type: 'VariableReference', valueType: 'varIdentifier', identifier: '__identity__' }
      ] as any,
      args: [],
      fields: [],
      rawArgs: []
    };

    const result = await processPipeline({
      value: variable,
      env,
      pipeline: [pipelineStage],
      identifier: 'input'
    });

    expect(result.mx?.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('wraps /show output and effects with capability metadata', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const handler = new TestEffectHandler();
    env.setEffectHandler(handler);

    const descriptor = makeSecurityDescriptor({ labels: ['secret'] });
    const templateSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    env.setVariable(
      'foo',
      createSimpleTextVariable('foo', 'value', templateSource, { security: descriptor })
    );

    const directive = parseSync('/show @foo')[0] as DirectiveNode;
    const result = await evaluateShow(directive, env);

    expect(result.value).toBeDefined();
    const showValue = result.value as any;
    expect(showValue.mx?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(handler.collected[0]?.capability?.security.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('serializes module export descriptors', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childEnv = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    childEnv.pushSecurityContext({
      descriptor: makeSecurityDescriptor({ labels: ['network'] }),
      kind: 'import'
    });

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const variable = createSimpleTextVariable('foo', 'bar', source, {
      security: makeSecurityDescriptor({ labels: ['secret'] })
    });
    const childVars = new Map<string, ReturnType<typeof createSimpleTextVariable>>([
      ['foo', variable]
    ]);

    const { moduleObject } = importer.processModuleExports(
      childVars,
      { frontmatter: null },
      undefined,
      null,
      childEnv
    );

    childEnv.popSecurityContext();

    const serialized = moduleObject.__metadata__?.foo?.security;
    expect(serialized?.labels).toEqual(expect.arrayContaining(['secret', 'network']));
  });

  it('attaches capability metadata when emitting file effects', async () => {
    const fileSystem = new MemoryFileSystem();
    const env = new Environment(fileSystem, new PathService(), '/');
    const handler = new TestEffectHandler();
    env.setEffectHandler(handler);

    const descriptor = makeSecurityDescriptor({ labels: ['secret'] });
    const templateSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    env.setVariable(
      'foo',
      createSimpleTextVariable('foo', 'file contents', templateSource, { security: descriptor })
    );

    const directive = parseSync('/output @foo to "out.txt"')[0] as DirectiveNode;
    await evaluateOutput(directive, env);

    const fileEffect = handler.collected.find(effect => effect.type === 'file');
    expect(fileEffect).toBeDefined();
    expect(fileEffect?.path).toContain('out.txt');
    expect(fileEffect?.capability?.security.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('propagates /exe labels to executable definitions and invocation results', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const exeDirective = parseSync('/exe secret @emit() = js { return "hello"; }')[0] as DirectiveNode;
    await evaluateExe(exeDirective, env);

    const execVar = env.getVariable('emit');
    expect(execVar?.mx.labels).toEqual(expect.arrayContaining(['secret']));

    const invocationDirective = parseSync('/var @result = @emit()')[0] as DirectiveNode;
    await evaluateVar(invocationDirective, env);

    const resultVar = env.getVariable('result');
    expect(resultVar?.mx.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('applies return label modifications with trust asymmetry', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const sourceDirective = parseSync('/var trusted @data = "ok"')[0] as DirectiveNode;
    await evaluateVar(sourceDirective, env);

    const exeDirective = parseSync('/exe @tag() = [ => untrusted @data ]')[0] as DirectiveNode;
    await evaluateExe(exeDirective, env);

    const invocation = parseSync('/var @result = @tag()')[0] as DirectiveNode;
    await evaluateVar(invocation, env);

    const resultVar = env.getVariable('result');
    expect(resultVar?.mx.labels).toContain('untrusted');
    expect(resultVar?.mx.labels).not.toContain('trusted');

    const dataVar = env.getVariable('data');
    expect(dataVar?.mx.labels).toContain('trusted');
    expect(dataVar?.mx.labels).not.toContain('untrusted');
  });

  it('keeps both trust labels on conflict', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const sourceDirective = parseSync('/var untrusted @data = "ok"')[0] as DirectiveNode;
    await evaluateVar(sourceDirective, env);

    const exeDirective = parseSync('/exe @tag() = [ => trusted @data ]')[0] as DirectiveNode;
    await evaluateExe(exeDirective, env);

    const invocation = parseSync('/var @result = @tag()')[0] as DirectiveNode;
    await evaluateVar(invocation, env);

    const resultVar = env.getVariable('result');
    expect(resultVar?.mx.labels).toEqual(expect.arrayContaining(['untrusted', 'trusted']));
  });

  it('blocks unprivileged return label removal', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const exeDirective = parseSync('/exe @strip() = [ => !pii "value" ]')[0] as DirectiveNode;
    await evaluateExe(exeDirective, env);

    const invocation = parseSync('/var @result = @strip()')[0] as DirectiveNode;
    await expect(evaluateVar(invocation, env)).rejects.toBeInstanceOf(MlldSecurityError);
  });

  it('merges descriptors during template interpolation', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const secretDirective = parseSync('/var secret @token = "shh"')[0] as DirectiveNode;
    await evaluateVar(secretDirective, env);

    const templateDirective = parseSync('/var @message = `Token: @token`')[0] as DirectiveNode;
    await evaluateVar(templateDirective, env);

    const messageVar = env.getVariable('message');
    expect(messageVar?.mx.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('propagates pipeline taint and labels into structured outputs and downstream results', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const tokenDirective = parseSync('/var secret @token = "abc123"')[0] as DirectiveNode;
    await evaluateDirective(tokenDirective, env);

    const emitDirective = parseSync('/exe @emitToken(value) = run { printf "Token: @value" }')[0] as DirectiveNode;
    const echoDirective = parseSync('/exe @echoValue(value) = run { printf "@value" }')[0] as DirectiveNode;
    const markDirective = parseSync('/exe @markDone(value) = js { return value + " :: done"; }')[0] as DirectiveNode;
    await evaluateDirective(emitDirective, env);
    await evaluateDirective(echoDirective, env);
    await evaluateDirective(markDirective, env);

    const pipelineDirective = parseSync('/var @pipelineOutput = @token | @emitToken | @echoValue | @markDone')[0] as DirectiveNode;
    await evaluateDirective(pipelineDirective, env);
    const pipelineVar = env.getVariable('pipelineOutput');
    expect(pipelineVar?.mx.labels).toEqual(expect.arrayContaining(['secret']));
    expect(pipelineVar?.mx.taint).toEqual(expect.arrayContaining(['secret']));

    const resultDirective = parseSync('/run { printf "Token: @token" }')[0] as DirectiveNode;
    const result = await evaluateDirective(resultDirective, env);
    const structuredResult = result.value as any;
    expect(structuredResult?.mx?.labels ?? []).toEqual([]);
    expect(structuredResult?.mx?.taint).toEqual(expect.arrayContaining(['src:exec']));
  });

  it('tags @input resolver variables with src:user taint', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    await env.registerBuiltinResolvers();

    const resolverVar = await env.getResolverVariable('input');
    expect(resolverVar?.mx?.taint).toEqual(expect.arrayContaining(['src:user']));
  });

  it('applies src:exec taint to /exe command output', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const exeDirective = parseSync('/exe @echo(value) = run { printf "@value" }')[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    const varDirective = parseSync('/var @result = @echo("hi")')[0] as DirectiveNode;
    await evaluateDirective(varDirective, env);

    const resultVar = env.getVariable('result');
    expect(resultVar?.mx?.taint).toEqual(expect.arrayContaining(['src:exec']));
  });

  it('applies src:file and directory labels to loaded file content', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-sec-load-'));
    const nestedDir = path.join(tmpRoot, 'secrets', 'configs');
    const filePath = path.join(nestedDir, 'vars.txt');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(filePath, 'token=abc');

    try {
      const env = new Environment(new NodeFileSystem(), new PathService(), tmpRoot);
      const directive = parseSync(`/var @config = <${path.relative(tmpRoot, filePath)}>`)[0] as DirectiveNode;

      await evaluateVar(directive, env);

      const variable = env.getVariable('config');
      const expectedDirs = getAllDirsInPath(filePath).map(dir => `dir:${dir}`);

      expect(variable?.mx.taint).toEqual(expect.arrayContaining(['src:file', ...expectedDirs]));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
