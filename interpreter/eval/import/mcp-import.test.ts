import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const crashServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/crash-server.cjs', import.meta.url)
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

  it('blocks MCP-tainted data from flowing to labeled template exe via policy', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      `/import tools { @echo } from mcp "${serverSpec}"`,
      '/var @policyConfig = { labels: { "src:mcp": { deny: ["destructive"] } } }',
      '/policy @p = union(@policyConfig)',
      '/var @mcpData = @echo({ text: "mcp data" })',
      '/exe destructive @destroy(data) = `destroyed: @data`',
      '/var @result = @destroy(@mcpData)',
      '/show @result'
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
      ).rejects.toThrow(/src:mcp.*cannot flow to.*destructive/);
    } finally {
      environment?.cleanup();
    }
  });

  it('exe wrapping a namespace MCP call with the same name does not trigger false recursion', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    // create_event → createEvent via mcpNameToMlldName.
    // The exe @createEvent delegates to @mcp.createEvent — the recursion guard
    // must not confuse the namespace-qualified call with a self-call.
    const source = [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe @createEvent(title, participants) = @mcp.createEvent(@title, @participants)',
      '/show @createEvent("standup", ["alice"])'
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

      expect(output).toContain('title="standup"');
      expect(output).toContain('participants=["alice"]');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves numeric-looking strings returned from js helpers when passed to MCP tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const cases = ['25', '0', '007', '1.5', 'true', '-1'];

    let environment: Environment | undefined;
    try {
      for (const value of cases) {
        const source = [
          `/import tools from mcp "${serverSpec}" as @mcp`,
          '/exe @asString(inputValue) = js { if (inputValue == null) return ""; return String(inputValue); }',
          `/show @mcp.typeMirror(@asString(${JSON.stringify(value)}))`
        ].join('\n');

        const output = await interpret(source, {
          fileSystem,
          pathService,
          pathContext,
          format: 'markdown',
          captureEnvironment: env => {
            environment = env;
          }
        });

        expect(output.trim()).toBe(`str_arg:string=${JSON.stringify(value)}`);
      }
    } finally {
      environment?.cleanup();
    }
  });

  it('restarts an imported MCP server that exits during the first tool call', async () => {
    const previousMarker = process.env.MLLD_MCP_CRASH_MARKER;
    const markerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-import-e2e-crash-'));
    const markerPath = path.join(markerDir, 'marker');
    process.env.MLLD_MCP_CRASH_MARKER = markerPath;

    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${crashServerPath}`;
    const source = [
      `/import tools { @echo } from mcp "${serverSpec}"`,
      '/show @echo("retry")'
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

      expect(output.trim()).toBe('retry');
    } finally {
      environment?.cleanup();
      if (previousMarker === undefined) {
        delete process.env.MLLD_MCP_CRASH_MARKER;
      } else {
        process.env.MLLD_MCP_CRASH_MARKER = previousMarker;
      }
      await fs.rm(markerDir, { recursive: true, force: true });
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
