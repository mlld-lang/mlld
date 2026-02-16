import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
};

describe('env MCP config integration', () => {
  it('registers MCP tools under explicit namespace aliases', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "as": "@github", "tools": ["ping"]}]}',
      '/env @cfg [',
      '  show @github.ping()',
      ']'
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

  it('applies with-clause profile and injects filtered MCP tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = when [',
      '  @mx.profile == "readonly" => {"servers": [{"command": "' + serverSpec + '", "tools": ["ping"]}]}',
      '  * => {"servers": []}',
      ']',
      '/env @cfg with { profile: "readonly" } [',
      '  show @ping()',
      ']'
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

  it('does not leak env-scoped MCP tools outside the env block', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "tools": ["ping"]}]}',
      '/env @cfg with { profile: "readonly" } [',
      '  show @ping()',
      ']',
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
      ).rejects.toThrow(/Variable not found: ping|not found|Undefined variable/i);
    } finally {
      environment?.cleanup();
    }
  });

  it('selects profile from env config profiles when profile override is not provided', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @denyShell = { deny: { sh: true } }',
      '/policy @p = union(@denyShell)',
      '/var @cfg = {',
      '  "profiles": {',
      '    "full": { "requires": { "sh": true } },',
      '    "readonly": { "requires": { } }',
      '  }',
      '}',
      '/exe @mcpConfig() = when [',
      '  @mx.profile == "readonly" => {"servers": [{"command": "' + serverSpec + '", "tools": ["ping"]}]}',
      '  * => {"servers": []}',
      ']',
      '/env @cfg [',
      '  show @mx.profile',
      '  show @ping()',
      ']'
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

      expect(output.trim()).toBe('readonly\n\npong');
    } finally {
      environment?.cleanup();
    }
  });

  it('sets @mx.tools.allowed and @mx.tools.denied for env mcpConfig tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = { tools: ["ping"] }',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "tools": ["ping", "echo"]}]}',
      '/env @cfg [',
      '  show @mx.tools.allowed | @json',
      '  show @mx.tools.denied | @json',
      ']'
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

      expect(output.trim()).toBe('["ping"]\n\n["echo"]');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves src:mcp taint and policy checks for tools from mcpConfig', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "tools": ["echo"]}]}',
      '/var @policyConfig = { labels: { "src:mcp": { deny: ["destructive"] } } }',
      '/policy @p = union(@policyConfig)',
      '/exe destructive @destroy(data) = `destroyed: @data`',
      '/env @cfg with { profile: "readonly" } [',
      '  let @mcpData = @echo({ text: "mcp data" })',
      '  let @result = @destroy(@mcpData)',
      '  show @result',
      ']'
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

  it('blocks MCP tool calls when env mcps scope is empty', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = { mcps: [] }',
      `/import tools { @ping } from mcp "${serverSpec}"`,
      '/env @cfg [',
      '  show @ping()',
      ']'
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
      ).rejects.toThrow(/denied by env\.mcps/i);
    } finally {
      environment?.cleanup();
    }
  });

  it('allows MCP tool calls for servers listed in env mcps scope', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {',
      '  mcps: [{ command: "' + process.execPath + '", args: ["' + fakeServerPath + '"] }]',
      '}',
      `/import tools { @ping } from mcp "${serverSpec}"`,
      '/env @cfg [',
      '  show @ping()',
      ']'
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
});
