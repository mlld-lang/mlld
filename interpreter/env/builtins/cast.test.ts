import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/cast-test.mld'
} as const;

function normalizeSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  const indents = lines
    .filter(line => line.trim().length > 0)
    .map(line => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(minIndent)).join('\n');
}

async function interpretWithEnv(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | undefined;

  await interpret(normalizeSource(source), {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

describe('@cast builtin', () => {
  it('reuses the existing record coercion path for successful casts', async () => {
    const env = await interpretWithEnv(`
      /record @contact = {
        facts: [email: string],
        data: [name: string]
      }

      /var @raw = {
        email: "ada@example.com",
        name: "Ada"
      }

      /var @coerced = @cast(@raw, @contact)
    `);

    try {
      const coerced = env.getVariable('coerced');
      if (!coerced) {
        throw new Error('Missing @coerced');
      }

      const value = await extractVariableValue(coerced as any, env);
      expect(isStructuredValue(value)).toBe(true);
      if (!isStructuredValue(value)) {
        return;
      }

      expect(value.data).toEqual({
        email: 'ada@example.com',
        name: 'Ada'
      });
      expect(value.mx.schema).toMatchObject({ valid: true, mode: 'demote' });
      expect(value.metadata?.projection).toMatchObject({
        kind: 'record',
        recordName: 'contact'
      });
    } finally {
      env.cleanup();
    }
  });

  it('fails with the same record-resolution errors as output-record coercion', async () => {
    await expect(
      interpretWithEnv(`
        /var @raw = {
          email: "ada@example.com"
        }

        /var @coerced = @cast(@raw, "missing_record")
      `)
    ).rejects.toThrow(/unknown record '@missing_record'/i);
  });
});
