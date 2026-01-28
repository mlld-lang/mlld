import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
};

describe('MCP tool imports', () => {
  it('imports and calls a selected MCP tool', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      `/import tools { @echo } from mcp "${serverSpec}"`,
      '/show @echo("hello")'
    ].join('\n');

    let environment: Environment | undefined;
    try {
      const output = await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        format: 'markdown',
        captureEnvironment: env => {
          environment = env;
        }
      });

      expect(output.trim()).toBe('hello');
    } finally {
      environment?.cleanup();
    }
  });

  it('imports MCP tools as a namespace', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/show @mcp.ping()'
    ].join('\n');

    let environment: Environment | undefined;
    try {
      const output = await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        format: 'markdown',
        captureEnvironment: env => {
          environment = env;
        }
      });

      expect(output.trim()).toBe('pong');
    } finally {
      environment?.cleanup();
    }
  });

  it('routes MCP calls through guards', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/guard @blockMcp before op:exe = when [',
      '  @mx.taint.includes("src:mcp") => deny "Blocked"',
      '  * => allow',
      ']',
      `/import tools { @ping } from mcp "${serverSpec}"`,
      '/show @ping()'
    ].join('\n');

    let environment: Environment | undefined;
    try {
      await expect(
        interpret(source, {
          fileSystem,
          pathService,
          pathContext,
          format: 'markdown',
          captureEnvironment: env => {
            environment = env;
          }
        })
      ).rejects.toThrow(/Blocked/);
    } finally {
      environment?.cleanup();
    }
  });

  it('rejects MCP tool imports that collide with local bindings', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/exe @echo(value) = run { printf "@value" }',
      `/import tools { @echo } from mcp "${serverSpec}"`
    ].join('\n');

    let environment: Environment | undefined;
    try {
      await expect(
        interpret(source, {
          fileSystem,
          pathService,
          pathContext,
          format: 'markdown',
          captureEnvironment: env => {
            environment = env;
          }
        })
      ).rejects.toThrow(/Import collision/);
    } finally {
      environment?.cleanup();
    }
  });
});
