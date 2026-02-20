import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { isDirectiveNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateDirective } from '@interpreter/eval/directive';
import { asText } from '@interpreter/utils/structured-value';
import { MlldCommandExecutionError } from '@core/errors';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';

function createEnv(root: string): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), root);
}

function registerProvider(env: Environment): string {
  const content = `exe @create(opts) = node {
  const releasePath = typeof opts?.releasePath === 'string' ? opts.releasePath : '';
  const envName = releasePath
    ? (opts?.fail ? 'fail:' + releasePath : releasePath)
    : (opts?.name || 'mock-env-' + Date.now());
  return { envName, created: true };
}

exe @execute(envName, command) = node {
  const shouldFail = typeof envName === 'string' && envName.startsWith('fail:');
  const stdout = [
    'provider',
    command?.secrets?.API_TOKEN || ''
  ].filter(Boolean).join('|');

  return {
    stdout,
    stderr: '',
    exitCode: shouldFail ? 1 : 0
  };
}

exe @release(envName) = node {
  const fs = require('fs');
  if (envName) {
    const path = String(envName).startsWith('fail:') ? String(envName).slice(5) : String(envName);
    fs.writeFileSync(path, 'released');
  }
  return '';
}

export { @create, @execute, @release }
`;
  const ref = '@mock/env-mock';
  env.registerDynamicModules({ [ref]: content }, { source: 'test' });
  return ref;
}

async function evaluateSource(source: string, env: Environment) {
  const directives = parseSync(source.trim());
  let lastResult;
  for (const node of directives) {
    if (!isDirectiveNode(node)) {
      continue;
    }
    lastResult = await evaluateDirective(node as DirectiveNode, env);
  }
  return lastResult;
}

describe('environment providers', () => {
  it('routes guard-selected run through provider and applies env label', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-env-provider-'));
    const releasePath = path.join(tempDir, 'release-success.txt');

    const env = createEnv(tempDir);
    env.setEffectHandler(new TestEffectHandler());
    const providerRef = registerProvider(env);
    env.recordPolicyConfig('test', {
      auth: {
        token: {
          from: 'env:TEST_TOKEN',
          as: 'API_TOKEN'
        }
      }
    });

    const previousToken = process.env.TEST_TOKEN;
    process.env.TEST_TOKEN = 'token-value';

    try {
      const source = `
/var @envConfig = { provider: ${JSON.stringify(providerRef)}, auth: "token", releasePath: ${JSON.stringify(releasePath)} }
/guard before op:run = when [
  * => env @envConfig
]
/run { printf "ignored" }
`;

      const result = await evaluateSource(source, env);
      const output = asText(result?.value);

      expect(output).toContain('provider');
      expect(output).toContain('token-value');
      expect(result?.value?.mx?.taint ?? []).toEqual(expect.arrayContaining(['src:env:mock']));
      expect(fs.existsSync(releasePath)).toBe(true);
    } finally {
      if (previousToken === undefined) {
        delete process.env.TEST_TOKEN;
      } else {
        process.env.TEST_TOKEN = previousToken;
      }
    }
  });

  it('skips provider release for named environments', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-env-provider-'));
    const releasePath = path.join(tempDir, 'release-named.txt');

    const env = createEnv(tempDir);
    env.setEffectHandler(new TestEffectHandler());
    const providerRef = registerProvider(env);
    env.recordPolicyConfig('test', {
      auth: {
        token: {
          from: 'env:TEST_TOKEN',
          as: 'API_TOKEN'
        }
      }
    });

    const previousToken = process.env.TEST_TOKEN;
    process.env.TEST_TOKEN = 'token-value';

    try {
      const source = `
/var @envConfig = { provider: ${JSON.stringify(providerRef)}, auth: "token", name: ${JSON.stringify(releasePath)} }
/guard before op:run = when [
  * => env @envConfig
]
/run { printf "ignored" }
`;

      const result = await evaluateSource(source, env);
      const output = asText(result?.value);

      expect(output).toContain('provider');
      expect(output).toContain('token-value');
      expect(fs.existsSync(releasePath)).toBe(false);
    } finally {
      if (previousToken === undefined) {
        delete process.env.TEST_TOKEN;
      } else {
        process.env.TEST_TOKEN = previousToken;
      }
    }
  });

  it('calls provider release on error paths', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-env-provider-'));
    const releasePath = path.join(tempDir, 'release-error.txt');

    const env = createEnv(tempDir);
    env.setEffectHandler(new TestEffectHandler());
    const providerRef = registerProvider(env);
    env.recordPolicyConfig('test', {
      auth: {
        token: {
          from: 'env:TEST_TOKEN',
          as: 'API_TOKEN'
        }
      }
    });

    const previousToken = process.env.TEST_TOKEN;
    process.env.TEST_TOKEN = 'token-value';

    try {
      const source = `
/var @envConfig = { provider: ${JSON.stringify(providerRef)}, auth: "token", releasePath: ${JSON.stringify(releasePath)}, fail: true }
/guard before op:run = when [
  * => env @envConfig
]
/run { printf "ignored" }
`;

      let thrown: unknown;
      try {
        await evaluateSource(source, env);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(MlldCommandExecutionError);
      expect(fs.existsSync(releasePath)).toBe(true);
    } finally {
      if (previousToken === undefined) {
        delete process.env.TEST_TOKEN;
      } else {
        process.env.TEST_TOKEN = previousToken;
      }
    }
  });
});
