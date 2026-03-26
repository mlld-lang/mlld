import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const callToolFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);
const callToolSequenceFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-tool-sequence-from-config.cjs', import.meta.url)
);
const callProjectedHandleFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-projected-handle-from-config.cjs', import.meta.url)
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

  it('exposes @mx.tools.available for the active llm tool list', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @sendEmail(recipient, subject, body) = "sent"',
      '/var @toolList = [@sendEmail, @fyi.facts]',
      '/exe llm @agent(prompt, config) = js { return JSON.stringify(mx.tools.available); }',
      '/show @agent("List the active tools", { tools: @toolList })'
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

      expect(JSON.parse(output.trim())).toEqual([
        { name: 'send_email' },
        { name: 'facts' }
      ]);
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

  it('preserves record coercion for MCP-imported executables from the same module', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = { facts: [email: string, name: string] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' }`,
      '/show @agent("Find Mark", { tools: @toolList })'
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

      expect(JSON.parse(output.trim())).toEqual({
        email: 'mark@example.com',
        name: 'Mark Davies'
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves display-projected outputs for MCP-imported executables from the same module', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, name: string],',
      '  data: [notes: string?],',
      '  display: [name, { mask: "email" }]',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies", notes: "Met at conference" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' }`,
      '/show @agent("Find Mark", { tools: @toolList })'
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

      expect(JSON.parse(output.trim())).toEqual({
        name: 'Mark Davies',
        email: {
          preview: 'm***@example.com',
          handle: {
            handle: expect.stringMatching(HANDLE_RE)
          }
        },
        notes: 'Met at conference'
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('uses projected result handles as the primary planner path without a separate facts call', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, name: string],',
      '  display: [name, { mask: "email" }]',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
      '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
      '/var @toolList = [@search_contacts, @send_email]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      '/var @basePolicy = {',
      '  defaults: { rules: ["no-send-to-unknown"] },',
      '  operations: { "exfil:send": ["tool:w"] }',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callProjectedHandleFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' "email.handle" send_email '{"subject":"hi","body":"test"}' }`,
      '/show @agent("Email Mark", { tools: @toolList }) with { policy: @basePolicy }'
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

      expect(output.trim()).toBe('sent:mark@example.com:hi');
    } finally {
      environment?.cleanup();
    }
  });

  it('applies box-level display strict mode to MCP-imported executable outputs', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, name: string],',
      '  data: [notes: string?],',
      '  display: [name, { mask: "email" }]',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies", notes: "Met at conference" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      '/var @cfg = { display: "strict" }',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' }`,
      '/box @cfg [',
      '  show @agent("Find Mark", { tools: @toolList })',
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

      expect(JSON.parse(output.trim())).toEqual({
        email: {
          handle: {
            handle: expect.stringMatching(HANDLE_RE)
          }
        },
        name: {
          handle: {
            handle: expect.stringMatching(HANDLE_RE)
          }
        },
        notes: 'Met at conference'
      });
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

  it('preserves imported @fyi.facts arrays when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/var @toolList = [@fyi.facts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/record @contact = { facts: [email: string] }',
      '/exe @emitContact() = js { return { email: "ada@example.com" }; } => contact',
      '/var @contact = @emitContact()',
      '/var @cfg = { fyi: { facts: [@contact] } }',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" facts '{"query":{"op":"op:named:email.send","arg":"recipient"}}' }`,
      '/box @cfg [',
      '  show @agent("Discover the allowed recipient", { tools: @toolList })',
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

      expect(JSON.parse(output.trim())).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'a***@example.com',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]);
    } finally {
      environment?.cleanup();
    }
  });

  it('supports imported @fyi.facts op-only grouped discovery for agent tool usage', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/var @toolList = [@fyi.facts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/record @contact = { facts: [email: string], data: [name: string] }',
      '/exe @emitContact() = js { return { email: "ada@example.com", name: "Ada" }; } => contact',
      '/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = "sent" with {',
      '  controlArgs: ["recipient"]',
      '}',
      '/var @contact = @emitContact()',
      '/var @cfg = { fyi: { facts: [@contact] } }',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" facts '{"query":"sendEmail"}' }`,
      '/box @cfg [',
      '  show @agent("Discover the allowed sendEmail facts", { tools: @toolList })',
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

      expect(JSON.parse(output.trim())).toEqual({
        recipient: [
          {
            handle: expect.stringMatching(HANDLE_RE),
            label: 'Ada',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ]
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('lets llm guards scope facts enforcement to contexts where the facts tool is available', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com" }; } => contact',
      '/var @plannerTools = [@search_contacts, @fyi.facts]',
      '/var @workerTools = [@search_contacts]',
      '/guard @requireFacts after op:llm = when [',
      '  @mx.tools.available[*].name.includes("facts") && !@mx.tools.calls.includes("facts") => deny "Facts required"',
      '  * => allow',
      ']',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}}]' }`,
      '/show @agent("Planner path", { tools: @plannerTools })'
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
      ).rejects.toThrow(/Facts required/);
    } finally {
      environment?.cleanup();
    }

    const allowSource = [
      '/record @contact = { facts: [email: string] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com" }; } => contact',
      '/var @workerTools = [@search_contacts]',
      '/guard @requireFacts after op:llm = when [',
      '  @mx.tools.available[*].name.includes("facts") && !@mx.tools.calls.includes("facts") => deny "Facts required"',
      '  * => allow',
      ']',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}}]' }`,
      '/show @agent("Worker path", { tools: @workerTools })'
    ].join('\n');

    environment = undefined;
    try {
      const output = await interpret(allowSource, {
        fileSystem,
        pathService,
        pathContext,
        format: 'markdown',
        captureEnvironment: env => {
          environment = env;
        }
      });

      expect(JSON.parse(output.trim())).toEqual({
        email: 'mark@example.com'
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves imported @fyi.facts arrays for direct with-clause fyi tool calls', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/var @toolList = [@fyi.facts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/record @contact = { facts: [email: string] }',
      '/exe @emitContact() = js { return { email: "mark@example.com" }; } => contact',
      '/var @contact = @emitContact()',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" facts '{"query":{"op":"op:named:email.send","arg":"recipient"}}' }`,
      '/show @agent("Discover the allowed recipient", { tools: @toolList }) with {',
      '  fyi: { facts: [@contact] }',
      '}'
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

      expect(JSON.parse(output.trim())).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'm***@example.com',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]);
    } finally {
      environment?.cleanup();
    }
  });

  it('auto-registers prior native tool results as fyi fact roots within one agent call', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string, name: string], display: [name, { mask: "email" }] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
      '/var @toolList = [@search_contacts, @fyi.facts]',
      '/var @cfg = { fyi: { facts: "auto" } }',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}},{"name":"facts","arguments":{}}]' }`,
      '/box @cfg [',
      '  show @agent("Find Mark", { tools: @toolList })',
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

      expect(JSON.parse(output.trim())).toEqual([
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Mark Davies',
          field: 'email',
          fact: 'fact:@contact.email'
        },
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'M*** D*****',
          field: 'name',
          fact: 'fact:@contact.name'
        }
      ]);
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
