import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
} as const;

async function interpretWithEnv(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

function requireVariable(env: Environment, identifier: string) {
  const variable = env.getVariable(identifier);
  if (!variable) {
    throw new Error(`Expected variable @${identifier} to exist`);
  }
  return variable;
}

describe('var evaluator characterization', () => {
  it('keeps assignment metadata for direct var definitions', async () => {
    const env = await interpretWithEnv('/var @message = \'hello\'');
    const message = requireVariable(env, 'message');

    expect(message.source.directive).toBe('var');
    expect(message.source.syntax).toBe('quoted');
    expect(message.mx?.definedAt).toBeDefined();
  });

  it('eagerly materializes simple object literals', async () => {
    const env = await interpretWithEnv('/var @payload = { "value": "ok", "count": 2 }');
    const payload = requireVariable(env, 'payload');

    expect(payload.type).toBe('object');
    expect(payload.isComplex).toBe(false);
    expect(payload.value).toEqual({ value: 'ok', count: 2 });
  });

  it('keeps complex object AST lazy and propagates referenced labels', async () => {
    const env = await interpretWithEnv(`
/var secret @secret = "token"
/var @payload = { "value": @secret, "count": 2 }
`);
    const payload = requireVariable(env, 'payload');

    expect(payload.type).toBe('object');
    expect(payload.isComplex).toBe(true);
    expect((payload.value as { type?: string }).type).toBe('object');
    expect(payload.mx?.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('preserves triple-colon template AST and descriptor labels', async () => {
    const env = await interpretWithEnv(`
/var secret @secret = "token"
/var @template = :::Result {{secret}}:::
`);
    const template = requireVariable(env, 'template');

    expect(template.type).toBe('template');
    expect(Array.isArray(template.value)).toBe(true);
    expect(template.mx?.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('handles field-access references with condensed pipelines', async () => {
    const env = await interpretWithEnv(`
/exe @upper(value) = js { return value.toUpperCase(); }
/var @user = { "name": "adam" }
/var @nameUpper = @user.name | @upper
`);
    const nameUpper = requireVariable(env, 'nameUpper');

    expect(nameUpper.type).toBe('structured');
    expect(isStructuredValue(nameUpper.value)).toBe(true);
    expect(asData(nameUpper.value)).toBe('ADAM');
  });

  it('handles variable-reference tails with with-clause pipelines', async () => {
    const env = await interpretWithEnv(`
/exe @upper(value) = js { return value.toUpperCase(); }
/var @user = { "name": "adam" }
/var @nameUpperWith = @user.name with { pipeline: [@upper] }
`);
    const nameUpperWith = requireVariable(env, 'nameUpperWith');

    expect(nameUpperWith.type).toBe('structured');
    expect(isStructuredValue(nameUpperWith.value)).toBe(true);
    expect(asData(nameUpperWith.value)).toBe('ADAM');
  });

  it('enforces tool-scope subset checks for derived env configs', async () => {
    await expect(
      interpretWithEnv(`
/var @baseEnv = { provider: '@local', tools: ["read"] }
/var @childEnv = new @baseEnv with { tools: ["read", "write"] }
`)
    ).rejects.toThrow(/Tool scope cannot add tools outside parent/);
  });

  it('rewrites pipeline results to structured variables when stages return structured data', async () => {
    const env = await interpretWithEnv(`
/exe @parseJson(input) = js { return JSON.parse(input); }
/var @parsed = '{"count":2}' | @parseJson
`);
    const parsed = requireVariable(env, 'parsed');

    expect(parsed.type).toBe('structured');
    expect(isStructuredValue(parsed.value)).toBe(true);
    expect(asData(parsed.value)).toEqual({ count: 2 });
  });

  it('keeps pipeline string results wrapped as structured variables', async () => {
    const env = await interpretWithEnv(`
/exe @trim(value) = js { return value.trim(); }
/var @trimmed = "  hi  " | @trim
`);
    const trimmed = requireVariable(env, 'trimmed');

    expect(trimmed.type).toBe('structured');
    expect(isStructuredValue(trimmed.value)).toBe(true);
    expect(asData(trimmed.value)).toBe('hi');
  });
});
