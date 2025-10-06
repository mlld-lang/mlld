import { describe, expect, it } from 'vitest';
import { FunctionRouter } from './FunctionRouter';
import type { Environment } from '@interpreter/env/Environment';
import { interpret, type InterpretResult } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

async function createEnvironment(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();
  const filePath = '/module.mld.md';

  await fileSystem.writeFile(filePath, source);

  const pathContext = {
    projectRoot: '/',
    fileDirectory: '/',
    filePath,
    executionDirectory: '/',
    invocationDirectory: '/',
  } as const;

  const result = (await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath,
    format: 'markdown',
    returnEnvironment: true,
    normalizeBlankLines: true,
  })) as InterpretResult;

  return result.environment;
}

describe('FunctionRouter', () => {
  it('executes exported function and returns string result', async () => {
    const environment = await createEnvironment(`
      /exe @greet(name) = js {
        return 'Hello ' + name;
      }

      /export { @greet }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('greet', { name: 'Alice' });

    expect(result).toBe('Hello Alice');
  });

  it('serializes object results as JSON', async () => {
    const environment = await createEnvironment(`
      /exe @getData() = js {
        return { name: 'Alice', age: 30 };
      }

      /export { @getData }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('get_data', {});

    expect(JSON.parse(result)).toEqual({ name: 'Alice', age: 30 });
  });

  it('treats missing trailing parameters as undefined', async () => {
    const environment = await createEnvironment(`
      /exe @greet(name, title) = js {
        if (title === undefined) {
          return 'Hello ' + name;
        }
        return 'Hello ' + title + ' ' + name;
      }

      /export { @greet }
    `);

    const router = new FunctionRouter({ environment });

    await expect(router.executeFunction('greet', { name: 'Bob', title: 'Dr.' })).resolves.toBe('Hello Dr. Bob');
    await expect(router.executeFunction('greet', { name: 'Charlie' })).resolves.toBe('Hello Charlie');
  });

  it('throws when function is not found', async () => {
    const environment = await createEnvironment('/export { }');
    const router = new FunctionRouter({ environment });

    await expect(router.executeFunction('missing_tool', {})).rejects.toThrow("Tool 'missing_tool' not found");
  });
});
