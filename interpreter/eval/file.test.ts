import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { interpret } from '@interpreter/index';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { PathContext } from '@core/services/PathContextService';

const execFile = promisify(execFileCallback);

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

async function readAuditEvents(fileSystem: MemoryFileSystem): Promise<Record<string, unknown>[]> {
  const auditPath = '/project/.llm/sec/audit.jsonl';
  const exists = await fileSystem.exists(auditPath).catch(() => false);
  if (!exists) {
    return [];
  }
  const content = await fileSystem.readFile(auditPath);
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

let cachedGitAvailable: boolean | null = null;

async function gitAvailable(): Promise<boolean> {
  if (cachedGitAvailable !== null) {
    return cachedGitAvailable;
  }
  try {
    await execFile('git', ['--version']);
    cachedGitAvailable = true;
  } catch {
    cachedGitAvailable = false;
  }
  return cachedGitAvailable;
}

async function runGit(repoDir: string, args: string[]): Promise<void> {
  await execFile('git', args, { cwd: repoDir });
}

async function currentGitBranch(repoDir: string): Promise<string> {
  const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir });
  return String(stdout).trim();
}

async function createGitFixture(
  setup: (repoDir: string) => Promise<void>
): Promise<string> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-git-fixture-'));
  await runGit(repoDir, ['init']);
  await runGit(repoDir, ['config', 'user.email', 'test@mlld.local']);
  await runGit(repoDir, ['config', 'user.name', 'mlld-test']);
  await setup(repoDir);
  await runGit(repoDir, ['add', '.']);
  await runGit(repoDir, ['commit', '-m', 'initial']);
  return repoDir;
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

  it('supports anonymous box blocks without config', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @out = box [',
        '  file "task.md" = "anonymous-box"',
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

    expect(String(output).trim()).toBe('anonymous-box');
    expect(await fileSystem.exists('/project/task.md')).toBe(false);
  });

  it('supports file/files + shell visibility in config-form boxes without explicit fs', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @cfg = { tools: ["Bash", "Read"] }',
        '/var @out = box @cfg [',
        '  file "config-box-vfs-x.txt" = "config-box-vfs"',
        '  let @r = run cmd { cat config-box-vfs-x.txt }',
        '  => @r',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('config-box-vfs');
    expect(await fileSystem.exists('/project/config-box-vfs-x.txt')).toBe(false);
  });

  it('resolves relative shell paths against project-root workspace cwd', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @out = box [',
        '  file "hello.txt" = "relative-shell-read"',
        '  => run cmd { cat hello.txt }',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('relative-shell-read');
  });

  it('routes run sh through workspace VFS inside box blocks', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @out = box [',
        '  file "box-sh-vfs-source-19f2.txt" = "from-sh-vfs"',
        '  run sh {',
        '    cat box-sh-vfs-source-19f2.txt > box-sh-vfs-target-19f2.txt',
        '  }',
        '  => run cmd { cat box-sh-vfs-target-19f2.txt }',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('from-sh-vfs');
    expect(await fileSystem.exists('/project/box-sh-vfs-source-19f2.txt')).toBe(false);
    expect(await fileSystem.exists('/project/box-sh-vfs-target-19f2.txt')).toBe(false);
  });

  it('routes boxed llm sh executables through host bash instead of workspace shell', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    const nodeBin = process.execPath.replace(/\\/g, '/');
    const originalBashBinary = process.env.MLLD_BASH_BINARY;
    const hostRoot = process.cwd().replace(/\\/g, '/');
    const hostPathContext: PathContext = {
      projectRoot: hostRoot,
      fileDirectory: hostRoot,
      executionDirectory: hostRoot,
      invocationDirectory: hostRoot,
      filePath: path.join(hostRoot, 'main.mld')
    };
    process.env.MLLD_BASH_BINARY = '/bin/bash';

    try {
      const output = await interpret(
        [
          '/exe llm @probe(nodeBin) = sh {',
          '  "$nodeBin" -e "process.stdout.write(\'host-llm-bash\')"',
          '}',
          '/var @out = box { tools: ["Bash"] } [',
          `  => @probe("${nodeBin}")`,
          ']',
          '/show @out'
        ].join('\n'),
        {
          fileSystem,
          pathService,
          pathContext: hostPathContext
        }
      );

      expect(String(output).trim()).toBe('host-llm-bash');
    } finally {
      if (originalBashBinary === undefined) {
        delete process.env.MLLD_BASH_BINARY;
      } else {
        process.env.MLLD_BASH_BINARY = originalBashBinary;
      }
    }
  });

  it('uses resolver shorthand workspaces in box blocks', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    let capturedEnv: any;

    const output = await interpret(
      [
        '/files <@workspace/> = [{ "task.md": "resolver-box" }]',
        '/var @out = box @workspace [',
        '  => run cmd { cat @root/task.md }',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext,
        captureEnvironment: env => {
          capturedEnv = env;
        }
      }
    );

    expect(String(output).trim()).toBe('resolver-box');
    const workspace = capturedEnv.getVariableValue('workspace') as { shellSession?: unknown };
    expect(workspace.shellSession).toBeDefined();
  });

  it('parses and executes nested box blocks', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/var @out = box [',
        '  let @inner = box [',
        '    file "inner.txt" = "nested-box"',
        '    => run cmd { cat inner.txt }',
        '  ]',
        '  => @inner',
        ']',
        '/show @out'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('nested-box');
  });

  it('does not attempt host filesystem writes for nested workspace file paths in box blocks', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const output = await interpret(
        [
          '/var @out = box [',
          "  file \"src/main.js\" = \"console.log('main')\"",
          '  => run cmd { cat src/main.js }',
          ']',
          '/show @out'
        ].join('\n'),
        {
          fileSystem,
          pathService,
          pathContext
        }
      );

      expect(String(output).trim()).toBe("console.log('main')");
      expect(await fileSystem.exists('/project/src/main.js')).toBe(false);

      const failedWriteLogs = consoleErrorSpy.mock.calls.filter(call =>
        String(call[0]).includes('Failed to write to file /project/src/main.js')
      );
      expect(failedWriteLogs).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('reads resolver-backed workspace files via file reference shorthand', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/files <@ws/> = [{ "task.md": "resolver-read" }]',
        '/show <@ws/task.md>'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('resolver-read');
    expect(await fileSystem.exists('/project/task.md')).toBe(false);
  });

  it('serializes workspace internals with map-backed data in show output', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/files <@workspace/> = [{ "task.md": "workspace-json", desc: "task file" }]',
        '/show @workspace'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    const parsed = JSON.parse(String(output).trim()) as {
      fs?: {
        shadowFiles?: Record<string, string>;
        deletedPaths?: unknown;
        explicitDirectories?: unknown;
      };
      descriptions?: Record<string, string>;
    };

    expect(parsed.fs?.shadowFiles?.['/project/task.md']).toBe('workspace-json');
    expect(parsed.descriptions?.['/project/task.md']).toBe('task file');
    expect(Array.isArray(parsed.fs?.deletedPaths)).toBe(true);
    expect(Array.isArray(parsed.fs?.explicitDirectories)).toBe(true);
  });

  it('uses fs workspace config form and restores nested workspace stack', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    const output = await interpret(
      [
        '/files <@outer/> = [{ "outer.txt": "outer" }]',
        '/files <@inner/> = [{ "inner.txt": "inner" }]',
        '/box { fs: @outer } [',
        '  let @first = run cmd { cat @root/outer.txt }',
        '  let @middle = box @inner [',
        '    let @innerValue = run cmd { cat @root/inner.txt }',
        '    => @innerValue',
        '  ]',
        '  let @last = run cmd { cat @root/outer.txt }',
        '  show @first',
        '  show @middle',
        '  show @last',
        ']',
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    expect(String(output).trim()).toBe('outer\n\ninner\n\nouter');
  });

  it('hydrates workspace files from a local git repository', async () => {
    if (!(await gitAvailable())) {
      return;
    }
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    let capturedEnv: any;

    const repoDir = await createGitFixture(async repo => {
      await fs.mkdir(path.join(repo, 'src'), { recursive: true });
      await fs.writeFile(path.join(repo, 'README.md'), 'root');
      await fs.writeFile(path.join(repo, 'src', 'main.ts'), 'export const value = 1;');
    });

    await interpret(
      `/files <@workspace/> = git "${repoDir}" path:"src/"`,
      {
        fileSystem,
        pathService,
        pathContext,
        mode: 'structured',
        captureEnvironment: env => {
          capturedEnv = env;
        }
      }
    );

    const workspace = capturedEnv.getVariableValue('workspace') as {
      fs: { readFile: (target: string) => Promise<string> };
    };

    expect(await workspace.fs.readFile('/project/main.ts')).toContain('value = 1');
    await expect(workspace.fs.readFile('/project/README.md')).rejects.toThrow();
  });

  it('supports git branch selection for hydration', async () => {
    if (!(await gitAvailable())) {
      return;
    }
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    let capturedEnv: any;

    const repoDir = await createGitFixture(async repo => {
      await fs.writeFile(path.join(repo, 'branch.txt'), 'main');
    });
    const baseBranch = await currentGitBranch(repoDir);
    await runGit(repoDir, ['checkout', '-b', 'feature']);
    await fs.writeFile(path.join(repoDir, 'branch.txt'), 'feature');
    await runGit(repoDir, ['add', 'branch.txt']);
    await runGit(repoDir, ['commit', '-m', 'feature branch']);
    await runGit(repoDir, ['checkout', baseBranch]);

    await interpret(
      `/files <@workspace/> = git "${repoDir}" branch:"feature"`,
      {
        fileSystem,
        pathService,
        pathContext,
        mode: 'structured',
        captureEnvironment: env => {
          capturedEnv = env;
        }
      }
    );

    const workspace = capturedEnv.getVariableValue('workspace') as {
      fs: { readFile: (target: string) => Promise<string> };
    };
    expect(await workspace.fs.readFile('/project/branch.txt')).toBe('feature');
  });

  it('skips binary files and symlinks during git hydration', async () => {
    if (!(await gitAvailable())) {
      return;
    }
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let capturedEnv: any;

    const repoDir = await createGitFixture(async repo => {
      await fs.writeFile(path.join(repo, 'text.txt'), 'hello');
      await fs.writeFile(path.join(repo, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02]));
      try {
        await fs.symlink('text.txt', path.join(repo, 'text.link'));
      } catch {
        // Ignore if symlink creation is not supported in the current environment.
      }
    });

    try {
      await interpret(
        `/files <@workspace/> = git "${repoDir}"`,
        {
          fileSystem,
          pathService,
          pathContext,
          mode: 'structured',
          captureEnvironment: env => {
            capturedEnv = env;
          }
        }
      );

      const workspace = capturedEnv.getVariableValue('workspace') as {
        fs: { readFile: (target: string) => Promise<string> };
      };

      expect(await workspace.fs.readFile('/project/text.txt')).toBe('hello');
      await expect(workspace.fs.readFile('/project/binary.bin')).rejects.toThrow();
      expect(
        warnSpy.mock.calls.some(call => String(call[0]).includes('Skipping binary file'))
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('enforces box network policy and redacts credentials in git source errors', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    let thrown: Error | null = null;
    try {
      await interpret(
        [
          '/box [',
          '  files <@workspace/> = git "https://alice:secret-token@github.com/mlld-lang/private-repo"',
          ']'
        ].join('\n'),
        {
          fileSystem,
          pathService,
          pathContext
        }
      );
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeTruthy();
    expect(thrown?.message ?? '').toMatch(/Network access denied/);
    expect(thrown?.message ?? '').not.toContain('secret-token');
  });

  it('returns workspace values from box blocks without explicit return for inspection', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();
    let capturedEnv: any;

    const result = await interpret(
      [
        '/var @result = box [',
        '  file "task.md" = "alpha"',
        '  run cmd { cp @root/task.md @root/task-copy.md }',
        ']',
        '/show @result.type'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext,
        mode: 'structured',
        captureEnvironment: env => {
          capturedEnv = env;
        }
      }
    ) as any;

    expect(String(result.output).trim()).toBe('workspace');
    const workspace = capturedEnv.getVariableValue('result') as {
      fs: { readFile: (target: string) => Promise<string> };
    };
    expect(await workspace.fs.readFile('/project/task-copy.md')).toContain('alpha');
  });

  it('records directive and command workspace writes in audit log with change types', async () => {
    const fileSystem = await createFileSystem();
    const pathService = new PathService();

    await interpret(
      [
        '/box [',
        '  file "task.md" = "alpha"',
        '  run cmd { cp @root/task.md @root/task-copy.md }',
        ']'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        pathContext
      }
    );

    const writes = (await readAuditEvents(fileSystem)).filter(event => event.event === 'write');
    const directiveWrites = writes.filter(event => event.path === '/project/task.md');
    const commandWrites = writes.filter(event => event.path === '/project/task-copy.md');

    expect(directiveWrites.length).toBeGreaterThanOrEqual(1);
    expect(commandWrites.length).toBeGreaterThanOrEqual(1);
    expect(
      directiveWrites.some(event => event.writer === 'directive:file' && event.changeType === 'created')
    ).toBe(true);
    expect(
      commandWrites.some(
        event =>
          typeof event.writer === 'string' &&
          event.writer === 'command:cp' &&
          event.changeType === 'created'
      )
    ).toBe(true);
  });
});
