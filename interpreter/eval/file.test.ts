import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { PathContext } from '@core/services/PathContextService';

const pathContext: PathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

async function createFileSystem(): Promise<MemoryFileSystem> {
  const fileSystem = new MemoryFileSystem();
  await fileSystem.mkdir('/project', { recursive: true });
  return fileSystem;
}

describe('file/files evaluation', () => {
  it('writes a standalone file to the default filesystem', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    await interpret('/file "notes.txt" = "hello"', {
      fileSystem,
      pathService,
      pathContext
    });

    expect(await fileSystem.readFile('/project/notes.txt')).toBe('hello');
  });

  it('creates and extends resolver-backed workspaces with files', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const result = await interpret(
      [
        '/files <@workspace/> = [{ "index.js": "one", desc: "entry" }]',
        '/files <@workspace/src/> = [{ "main.ts": "two" }]',
        '/show @workspace.type'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext,
        mode: 'structured'
      }
    ) as any;

    expect(String(result.output).trim()).toBe('workspace');

    const workspace = result.environment.getVariableValue('workspace') as {
      fs: { readFile: (path: string) => Promise<string> };
      descriptions: Map<string, string>;
    };

    expect(await workspace.fs.readFile('/project/index.js')).toBe('one');
    expect(await workspace.fs.readFile('/project/src/main.ts')).toBe('two');
    expect(workspace.descriptions.get('/project/index.js')).toBe('entry');
    expect(await fileSystem.exists('/project/index.js')).toBe(false);
  });

  it('rejects absolute and traversal paths', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    await expect(
      interpret('/file "/abs.txt" = "bad"', {
        fileSystem,
        pathService,
        pathContext
      })
    ).rejects.toThrow('relative paths');

    await expect(
      interpret('/file "../escape.txt" = "bad"', {
        fileSystem,
        pathService,
        pathContext
      })
    ).rejects.toThrow("cannot contain '..'");
  });

  it('enforces immutability for duplicate workspace writes', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    await expect(
      interpret(
        [
          '/files <@workspace/> = [{ "a.txt": "first" }]',
          '/files <@workspace/> = [{ "a.txt": "second" }]'
        ].join('\n'),
        {
          fileSystem,
          pathService,
          pathContext
        }
      )
    ).rejects.toThrow("cannot overwrite '/project/a.txt'");
  });

  it('supports file/files directives inside box blocks using workspace VFS', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @out = box with { tools: "*" } [',
        '  file "task.md" = "inside-box"',
        '  let @result = run cmd { cat @root/task.md }',
        '  => @result',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('inside-box');
    expect(await fileSystem.exists('/project/task.md')).toBe(false);
  });
});
