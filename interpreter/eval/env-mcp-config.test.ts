import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const callToolFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
};

describe('box MCP config integration', () => {
  it('registers MCP tools under explicit namespace aliases', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "as": "@github", "tools": ["ping"]}]}',
      '/box @cfg [',
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
      '/box @cfg with { profile: "readonly" } [',
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

  it('does not leak box-scoped MCP tools outside the box block', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {}',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "tools": ["ping"]}]}',
      '/box @cfg with { profile: "readonly" } [',
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

  it('selects profile from box config profiles when profile override is not provided', async () => {
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
      '/box @cfg [',
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

  it('sets @mx.tools.allowed and @mx.tools.denied for box mcpConfig tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = { tools: ["ping"] }',
      '/exe @mcpConfig() = {"servers": [{"command": "' + serverSpec + '", "tools": ["ping", "echo"]}]}',
      '/box @cfg [',
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
      '/box @cfg with { profile: "readonly" } [',
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

  it('blocks MCP tool calls when box mcps scope is empty', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = { mcps: [] }',
      `/import tools { @ping } from mcp "${serverSpec}"`,
      '/box @cfg [',
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

  it('allows MCP tool calls for servers listed in box mcps scope', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      '/var @cfg = {',
      '  mcps: [{ command: "' + process.execPath + '", args: ["' + fakeServerPath + '"] }]',
      '}',
      `/import tools { @ping } from mcp "${serverSpec}"`,
      '/box @cfg [',
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

  it('preserves imported executable arrays when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/exe tool:w @send_email(recipient, subject, body) = `sent:@subject`',
      '/var @toolList = [@send_email]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/exe llm @agent(prompt, config) = `@mx.llm.allowed`',
      '/show @agent("Email the summary", { tools: @toolList })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__send_email');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves mixed concatenated executable arrays when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/mcp_active.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe tool:w @send_email(recipient, subject, body) = [',
      '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
      ']',
      '/var @toolList = [@send_email]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/exe @research(question) = `researched:@question`',
      '/var @workerTools = @toolList.concat([@research])',
      '/exe llm @agent(prompt, config) = `@mx.llm.allowed`',
      '/show @agent("Email the summary", { tools: @workerTools })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__send_email,mcp__mlld_tools__research');
    } finally {
      environment?.cleanup();
    }
  });

  it('does not seed native tool bridge policy state from imported toolList capabilities', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/mcp_active.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe known @get_recipient() = [',
      '  => @mcp.echo("legit@example.com")',
      ']',
      '/exe exfil:send, tool:w @send_email(recipient, subject, body) = [',
      '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
      '] with { controlArgs: ["recipient"] }',
      '/var @toolList = [@get_recipient, @send_email]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/var @basePolicy = {',
      '  defaults: { rules: ["no-send-to-unknown"] },',
      '  operations: { "exfil:send": ["tool:w"] }',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" send_email '{"recipient":"evil@example.com","subject":"hi","body":"test"}' }`,
      '/show @agent("Send the email", { tools: @toolList }) with { policy: @basePolicy }'
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

      expect(output.trim()).toMatch(/destination must carry 'known'/i);
    } finally {
      environment?.cleanup();
    }
  });

  it('allows native tool calls when policy authorizations carry explicit attestations', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/mcp_active.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe exfil:send, tool:w @send_email(recipient, subject, body) = [',
      '  => @mcp.sendEmail([@recipient], @subject, @body, [], [], [])',
      '] with { controlArgs: ["recipient"] }',
      '/var @toolList = [@send_email]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/var @taskPolicy = {',
      '  defaults: { rules: ["no-send-to-unknown"] },',
      '  operations: { "exfil:send": ["tool:w"] },',
      '  authorizations: {',
      '    allow: {',
      '      send_email: {',
      '        args: {',
      '          recipient: { eq: "approved@example.com", attestations: ["known"] }',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" send_email '{"recipient":"approved@example.com","subject":"hi","body":"test"}' }`,
      '/show @agent("Send the email", { tools: @toolList }) with { policy: @taskPolicy }'
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

      expect(output.trim()).toContain('recipients=["approved@example.com"]');
    } finally {
      environment?.cleanup();
    }
  });
});
