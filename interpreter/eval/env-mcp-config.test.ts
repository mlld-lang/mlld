import { describe, it, expect } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
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
const callProjectedValueFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-projected-value-from-config.cjs', import.meta.url)
);
const callProjectedObjectFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-projected-object-from-config.cjs', import.meta.url)
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
      '/var @toolList = [@sendEmail, @fyi.known]',
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
        { name: 'known' }
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

  it('preserves an explicit empty tool policy as a strict llm config', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe llm @agent(prompt, config) = [',
      '  => {',
      '    config: @mx.llm.config,',
      '    allowed: @mx.llm.allowed,',
      '    native: @mx.llm.native,',
      '    hasTools: @mx.llm.hasTools',
      '  }',
      ']',
      '/show @agent("Pure text generation", { tools: [] })'
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
        config: expect.any(String),
        allowed: '',
        native: '',
        hasTools: true
      });
      expect(JSON.parse(output.trim()).config).not.toBe('');
    } finally {
      environment?.cleanup();
    }
  });

  it('resumes tool-bridge llm calls without re-executing tools and preserves resume decision history', async () => {
    const fileSystem = new MemoryFileSystem();
    const counterKey = '__mlldGuardResumeToolCount';
    const promptKey = '__mlldGuardResumePrompt';
    const agentCallKey = '__mlldGuardResumeAgentCalls';
    const initialSessionKey = '__mlldGuardResumeToolInitialSession';
    const resumedSessionKey = '__mlldGuardResumeToolResumedSession';
    (globalThis as Record<string, unknown>)[counterKey] = 0;
    (globalThis as Record<string, unknown>)[promptKey] = null;
    (globalThis as Record<string, unknown>)[agentCallKey] = 0;
    (globalThis as Record<string, unknown>)[initialSessionKey] = null;
    (globalThis as Record<string, unknown>)[resumedSessionKey] = null;

    const source = [
      '/record @agent_result = {',
      '  data: [ok: boolean],',
      '  validate: "demote"',
      '}',
      '/exe @check_result(value) = @value => agent_result',
      `/exe tool:w @write_once() = js { return "write-ready"; }`,
      `/exe @read_calls() = js { return globalThis.${counterKey} || 0; }`,
      `/exe @read_prompt() = js { return globalThis.${promptKey} ?? null; }`,
      `/exe @read_agent_calls() = js { return globalThis.${agentCallKey} || 0; }`,
      `/exe @read_initial_session() = js { return globalThis.${initialSessionKey} ?? null; }`,
      `/exe @read_resumed_session() = js { return globalThis.${resumedSessionKey} ?? null; }`,
      `/exe llm @agent(prompt, config) = js {
  globalThis.${agentCallKey} = (globalThis.${agentCallKey} || 0) + 1;
  const resume = config?._mlld?.resume;
  if (resume?.continue) {
    globalThis.${promptKey} = prompt;
    globalThis.${resumedSessionKey} = resume.sessionId ?? null;
    return {
      value: { ok: true },
      _mlld: { sessionId: resume.sessionId, provider: 'fake' }
    };
  }
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  globalThis.${initialSessionKey} = resume?.sessionId ?? null;
  return {
    value: { ok: 'bad' },
    _mlld: { sessionId: 'tool-bridge-session', provider: 'fake' }
  };
}`,
      '/guard after for op:named:agent = when [',
      '  @check_result(@output).mx.schema.valid == false && @mx.guard.try < 2 => resume "Return valid JSON only"',
      '  @check_result(@output).mx.schema.valid == false => deny "still invalid"',
      '  * => allow',
      ']',
      '/var @result = @agent("start", { tools: [@write_once] })',
      '/var @checked = @check_result(@result)',
      '/var @summary = { ok: @checked.ok, schemaValid: @checked.mx.schema.valid, calls: @read_calls(), prompt: @read_prompt(), agentCalls: @read_agent_calls(), initialSession: @read_initial_session(), resumedSession: @read_resumed_session() }',
      '/show @summary'
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
        ok: true,
        schemaValid: true,
        calls: 1,
        prompt: 'Return valid JSON only',
        agentCalls: 2,
        initialSession: '',
        resumedSession: 'tool-bridge-session'
      });
    } finally {
      delete (globalThis as Record<string, unknown>)[counterKey];
      delete (globalThis as Record<string, unknown>)[promptKey];
      delete (globalThis as Record<string, unknown>)[agentCallKey];
      delete (globalThis as Record<string, unknown>)[initialSessionKey];
      delete (globalThis as Record<string, unknown>)[resumedSessionKey];
      environment?.cleanup();
    }
  });

  it('resumes plain llm calls without tool bridge when the module returns resume state', async () => {
    const fileSystem = new MemoryFileSystem();
    const promptKey = '__mlldGuardResumePlainPrompt';
    const agentCallKey = '__mlldGuardResumePlainAgentCalls';
    const initialSessionKey = '__mlldGuardResumePlainInitialSession';
    const resumedSessionKey = '__mlldGuardResumePlainResumedSession';
    (globalThis as Record<string, unknown>)[promptKey] = null;
    (globalThis as Record<string, unknown>)[agentCallKey] = 0;
    (globalThis as Record<string, unknown>)[initialSessionKey] = null;
    (globalThis as Record<string, unknown>)[resumedSessionKey] = null;

    const source = [
      '/record @agent_result = {',
      '  data: [ok: boolean],',
      '  validate: "demote"',
      '}',
      '/exe @check_result(value) = @value => agent_result',
      `/exe @read_prompt() = js { return globalThis.${promptKey} ?? null; }`,
      `/exe @read_agent_calls() = js { return globalThis.${agentCallKey} || 0; }`,
      `/exe @read_initial_session() = js { return globalThis.${initialSessionKey} ?? null; }`,
      `/exe @read_resumed_session() = js { return globalThis.${resumedSessionKey} ?? null; }`,
      `/exe llm @agent(prompt, config) = js {
  globalThis.${agentCallKey} = (globalThis.${agentCallKey} || 0) + 1;
  const resume = config?._mlld?.resume;
  if (resume?.continue) {
    globalThis.${promptKey} = prompt;
    globalThis.${resumedSessionKey} = resume.sessionId ?? null;
    return {
      value: { ok: true },
      _mlld: { sessionId: resume.sessionId, provider: 'fake' }
    };
  }
  globalThis.${initialSessionKey} = resume?.sessionId ?? null;
  return {
    value: { ok: 'bad' },
    _mlld: { sessionId: resume?.sessionId, provider: 'fake' }
  };
}`,
      '/guard after for op:named:agent = when [',
      '  @check_result(@output).mx.schema.valid == false && @mx.guard.try < 2 => resume "Return valid JSON only"',
      '  @check_result(@output).mx.schema.valid == false => deny "still invalid"',
      '  * => allow',
      ']',
      '/var @result = @agent("start")',
      '/var @checked = @check_result(@result)',
      '/var @summary = { ok: @checked.ok, schemaValid: @checked.mx.schema.valid, prompt: @read_prompt(), agentCalls: @read_agent_calls(), initialSession: @read_initial_session(), resumedSession: @read_resumed_session() }',
      '/show @summary'
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

      const summary = JSON.parse(output.trim());
      expect(summary.ok).toBe(true);
      expect(summary.schemaValid).toBe(true);
      expect(summary.prompt).toBe('Return valid JSON only');
      expect(summary.agentCalls).toBe(2);
      expect(summary.initialSession).toMatch(/^.+$/);
      expect(summary.resumedSession).toBe(summary.initialSession);
    } finally {
      delete (globalThis as Record<string, unknown>)[promptKey];
      delete (globalThis as Record<string, unknown>)[agentCallKey];
      delete (globalThis as Record<string, unknown>)[initialSessionKey];
      delete (globalThis as Record<string, unknown>)[resumedSessionKey];
      environment?.cleanup();
    }
  });

  it('clears tools for plain llm continuations even without guard-triggered resume', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @write_once() = js { return "write-ready"; }',
      '/exe llm @agent(prompt, config) = js {',
      '  return {',
      '    tools: config?.tools ?? null,',
      '    resume: config?._mlld?.resume ?? null',
      '  };',
      '}',
      '/var @result = @agent("start", {',
      '  tools: [@write_once],',
      '  _mlld: { resume: { sessionId: "resume-session", provider: "fake", continue: true } }',
      '})',
      '/show @result'
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
        tools: [],
        resume: {
          sessionId: 'resume-session',
          provider: 'fake',
          continue: true
        }
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('disables auto-provisioned @shelve during llm resume continuations', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @agent_result = {',
      '  data: [ok: boolean, tools: array],',
      '  validate: "demote"',
      '}',
      '/exe @check_result(value) = @value => agent_result',
      '/shelf @state = {',
      '  selected: agent_result?',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  const resume = config?._mlld?.resume;',
      '  return {',
      '    value: { ok: resume?.continue ? true : "bad", tools: (mx.tools.available ?? []).map(tool => tool.name) },',
      '    _mlld: { sessionId: resume?.sessionId ?? "resume-session", provider: "fake" }',
      '  };',
      '}',
      '/guard after for op:named:agent = when [',
      '  @check_result(@output).mx.schema.valid == false && @mx.guard.try < 2 => resume "Return valid JSON only"',
      '  @check_result(@output).mx.schema.valid == false => deny "still invalid"',
      '  * => allow',
      ']',
      '/box {',
      '  shelf: { write: [@state.selected] }',
      '} [',
      '  let @result = @agent("start")',
      '  show @result | @json',
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
        ok: true,
        tools: []
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('allows a later pre-guard on the same exe llm to switch from retry to resume', async () => {
    const fileSystem = new MemoryFileSystem();
    const promptKey = '__mlldGuardResumePrePrompt';
    const agentCallKey = '__mlldGuardResumePreAgentCalls';
    const initialSessionKey = '__mlldGuardResumePreInitialSession';
    const resumedSessionKey = '__mlldGuardResumePreResumedSession';
    (globalThis as Record<string, unknown>)[promptKey] = null;
    (globalThis as Record<string, unknown>)[agentCallKey] = 0;
    (globalThis as Record<string, unknown>)[initialSessionKey] = null;
    (globalThis as Record<string, unknown>)[resumedSessionKey] = null;

    const source = [
      '/record @agent_result = {',
      '  data: [ok: boolean],',
      '  validate: "demote"',
      '}',
      '/exe @check_result(value) = @value => agent_result',
      `/exe @read_prompt() = js { return globalThis.${promptKey} ?? null; }`,
      `/exe @read_agent_calls() = js { return globalThis.${agentCallKey} || 0; }`,
      `/exe @read_initial_session() = js { return globalThis.${initialSessionKey} ?? null; }`,
      `/exe @read_resumed_session() = js { return globalThis.${resumedSessionKey} ?? null; }`,
      `/exe llm @agent(prompt, config) = js {
  globalThis.${agentCallKey} = (globalThis.${agentCallKey} || 0) + 1;
  const resume = config?._mlld?.resume;
  if (resume?.continue) {
    globalThis.${promptKey} = prompt;
    globalThis.${resumedSessionKey} = resume.sessionId ?? null;
    return {
      value: { ok: true },
      _mlld: { sessionId: resume.sessionId, provider: 'fake' }
    };
  }
  globalThis.${initialSessionKey} = resume?.sessionId ?? null;
  return {
    value: { ok: 'bad' },
    _mlld: { sessionId: resume?.sessionId, provider: 'fake' }
  };
}`,
      '/guard before for op:named:agent = when [',
      '  @mx.guard.try == 2 => resume "Return valid JSON only"',
      '  * => allow',
      ']',
      '/guard after for op:named:agent = when [',
      '  @check_result(@output).mx.schema.valid == false && @mx.guard.try < 2 => retry "retry before resume"',
      '  @check_result(@output).mx.schema.valid == false => deny "still invalid"',
      '  * => allow',
      ']',
      '/var @result = @agent("start")',
      '/var @checked = @check_result(@result)',
      '/var @summary = { ok: @checked.ok, schemaValid: @checked.mx.schema.valid, prompt: @read_prompt(), agentCalls: @read_agent_calls(), initialSession: @read_initial_session(), resumedSession: @read_resumed_session() }',
      '/show @summary'
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

      const summary = JSON.parse(output.trim());
      expect(summary.ok).toBe(true);
      expect(summary.schemaValid).toBe(true);
      expect(summary.prompt).toBe('Return valid JSON only');
      expect(summary.agentCalls).toBe(2);
      expect(summary.initialSession).toMatch(/^.+$/);
      expect(summary.resumedSession).toBe(summary.initialSession);
    } finally {
      delete (globalThis as Record<string, unknown>)[promptKey];
      delete (globalThis as Record<string, unknown>)[agentCallKey];
      delete (globalThis as Record<string, unknown>)[initialSessionKey];
      delete (globalThis as Record<string, unknown>)[resumedSessionKey];
      environment?.cleanup();
    }
  });

  it('errors clearly when resume is requested but the llm module does not return resume state', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @agent_result = {',
      '  data: [ok: boolean],',
      '  validate: "demote"',
      '}',
      '/exe llm @agent(prompt, config) = { ok: "bad" } => agent_result',
      '/guard after for op:named:agent = when [',
      '  @output.mx.schema.valid == false => resume "Return valid JSON only"',
      '  * => allow',
      ']',
      '/show @agent("start")'
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
      ).rejects.toThrow(/resume not available for this exe/i);
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves when-selected executable refs when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe llm @agent(prompt, config) = `@mx.llm.allowed`',
      '/exe @hello() = "hi"',
      '/exe @bye() = "bye"',
      '/exe @pick(name) = when @name [',
      '  "hello" => @hello',
      '  "bye" => @bye',
      '  * => null',
      ']',
      '/var @subset = for @name in ["hello"] => @pick(@name)',
      '/show @agent("Email the summary", { tools: @subset })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__hello');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves object-indexed executable refs through for-expressions when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe llm @agent(prompt, config) = `@mx.llm.allowed`',
      '/exe @hello() = "hi"',
      '/exe @bye() = "bye"',
      '/var @toolMap = { hello: @hello, bye: @bye }',
      '/var @subset = for @name in ["hello"] => @toolMap[@name]',
      '/show @agent("Email the summary", { tools: @subset })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__hello');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves imported MCP-backed wrapper exes when invoked through the llm tool bridge', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/calendar_tools.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe tool:r @lookup_message(text) = @mcp.echo(@text)',
      '/export { @lookup_message }'
    ].join('\n'));

    const source = [
      '/import { @lookup_message } from "/calendar_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" lookup_message '{"text":"from-import"}' }`,
      '/show @agent("Find the imported wrapper", { tools: [@lookup_message] })'
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

      expect(output.trim()).toBe('from-import');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves ambient @mx.llm bridge context through imported llm wrappers that omit inner config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/provider.mld', [
      `/exe llm @provider(prompt, config) = cmd { ${process.execPath} -e "process.stdout.write(process.argv[1] ?? 'MISSING')" "@mx.llm.allowed" }`,
      '/export { @provider }'
    ].join('\n'));

    const source = [
      '/import { @provider } from "/provider.mld"',
      '/exe @hello() = "hi"',
      '/exe llm @agent(prompt, config) = @provider(@prompt, { system: "nested config without tools" })',
      '/show @agent("Use the tool bridge", { tools: [@hello] })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__hello');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves ambient @mx.llm bridge context through imported block-style llm wrappers that omit inner config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/provider.mld', [
      '/exe llm @provider(prompt, config) = [',
      '  let @allowed = when [',
      '    @mx.llm && @mx.llm.allowed => @mx.llm.allowed',
      '    * => "MISSING"',
      '  ]',
      '  => @allowed',
      ']',
      '/export { @provider }'
    ].join('\n'));

    const source = [
      '/import { @provider } from "/provider.mld"',
      '/exe @hello() = "hi"',
      '/exe llm @agent(prompt, config) = @provider(@prompt, { system: "nested config without tools" })',
      '/show @agent("Use the tool bridge", { tools: [@hello] })'
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

      expect(output.trim()).toBe('mcp__mlld_tools__hello');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves record coercion for imported MCP-backed wrapper exes on the llm tool bridge', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = { facts: [email: string, name: string] }',
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe tool:r @lookup_contact(query) = @mcp.echo("{\\"email\\":\\"ada@example.com\\",\\"name\\":\\"Ada Lovelace\\"}") => contact',
      '/export { @lookup_contact }'
    ].join('\n'));

    const source = [
      '/import { @lookup_contact } from "/contacts_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" lookup_contact '{"query":"Ada"}' }`,
      '/show @agent("Find Ada", { tools: [@lookup_contact] })'
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
        email: 'ada@example.com',
        name: 'Ada Lovelace'
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves shared imported MCP namespace bindings across multiple wrapper exes on the llm tool bridge', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/multi_tools.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe tool:r @first_lookup() = @mcp.echo("first-import")',
      '/exe tool:r @second_lookup() = @mcp.echo("second-import")',
      '/export { @first_lookup, @second_lookup }'
    ].join('\n'));

    const source = [
      '/import { @first_lookup, @second_lookup } from "/multi_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"first_lookup","arguments":{}},{"name":"second_lookup","arguments":{}}]' }`,
      '/show @agent("Call both imported wrappers", { tools: [@first_lookup, @second_lookup] })'
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

      expect(output.trim()).toBe('second-import');
    } finally {
      environment?.cleanup();
    }
  });

  it('preserves imported MCP-backed wrappers through benchmark-shaped tool-map selection before the llm tool bridge', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/tools.mld', [
      '/import tools from mcp "tools" as @mcp',
      '/exe tool:r @myTool(arg) = @mcp.echo(@arg)',
      '/var @toolList = [@myTool]',
      '/var @toolMap = { "my_tool": @myTool }',
      '/export { @toolList, @toolMap }'
    ].join('\n'));

    const source = [
      '/import { @toolList as @workspaceToolList, @toolMap as @workspaceToolMap } from "/tools.mld"',
      '/var @suiteToolMap = when "workspace" [',
      '  * => @workspaceToolMap',
      ']',
      '/var @config = {',
      '  tools: @workspaceToolList,',
      '  toolMap: @suiteToolMap,',
      '  toolNames: ["my_tool"]',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" my_tool '{"arg":"policygen-shape"}' }`,
      '/exe @policygen() = [',
      '  let @cfg = @config ?? {}',
      '  let @toolMap = @cfg.toolMap ?? {}',
      '  let @toolNames = @cfg.toolNames ?? []',
      '  let @toolDocsJson = @fyi.tools(for @name in @toolNames => @toolMap[@name], { format: "json" })',
      '  let @selected = for @name in @toolNames => @toolMap[@name]',
      '  => @agent("Call imported tool", { tools: @selected })',
      ']',
      '/show @policygen()'
    ].join('\n');

    let environment: Environment | undefined;
    try {
      const output = await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        format: 'markdown',
        mcpServers: {
          tools: `${process.execPath} ${fakeServerPath}`
        },
        captureEnvironment: env => {
          environment = env;
        }
      } as any);

      expect(output.trim()).toBe('policygen-shape');
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
          handle: expect.stringMatching(HANDLE_RE)
        }
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('keeps display-bearing record values literal during direct mlld evaluation outside the MCP boundary', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, name: string],',
      '  data: [notes: string?],',
      '  display: [name, { mask: "email" }]',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies", notes: "Met at conference" }; } => contact',
      '/export { @search_contacts }'
    ].join('\n'));

    const source = [
      '/import { @search_contacts } from "/contacts_tools.mld"',
      '/var @contact = @search_contacts("Mark")',
      '/show @contact'
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
        name: 'Mark Davies',
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

  it('accepts bare handle token strings copied from projected results on the MCP bridge path', async () => {
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
      `/exe llm @agent(prompt, config) = cmd { node "${callProjectedValueFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' "email.handle" send_email '{"subject":"hi","body":"test"}' }`,
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

  it('preserves projected fact handles for auto-provisioned shelve under with-policy bridge sessions', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = {',
      '  facts: [email: string],',
      '  display: [{ ref: "email" }]',
      '}',
      '/shelf @outreach = {',
      '  selected: contact?',
      '}',
      '/exe @search_contacts(query) = js { return { email: "alice@example.com" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/var @basePolicy = {',
      '  defaults: { rules: ["no-send-to-unknown"] }',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callProjectedObjectFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Alice"}' '{"email":"email.handle"}' shelve '{"slot_alias":"outreach.selected"}' value }`,
      '/box {',
      '  shelf: { write: [@outreach.selected] }',
      '} [',
      '  show @agent("Pick Alice", { tools: @toolList }) with { policy: @basePolicy }',
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
          value: 'alice@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      });

      const outreach = environment?.getVariable('outreach');
      expect(outreach).toBeDefined();

      const selected = await accessField(outreach, { type: 'field', value: 'selected' } as any, { env: environment });
      const email = await accessField(selected, { type: 'field', value: 'email' } as any, { env: environment });

      expect((email as any).mx?.labels).toEqual(expect.arrayContaining(['fact:@contact.email']));
      expect((email as any).mx?.factsources).toEqual([
        expect.objectContaining({
          ref: '@contact.email',
          sourceRef: '@contact',
          field: 'email'
        })
      ]);
    } finally {
      environment?.cleanup();
    }
  });

  it('does not authorize masked previews for imported tool lists in the same MCP session', async () => {
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
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}},{"name":"send_email","arguments":{"recipient":"m***@example.com","subject":"hi","body":"test"}}]' }`,
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

      expect(output.trim()).toMatch(/destination must carry 'known'/i);
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
          handle: expect.stringMatching(HANDLE_RE)
        },
        name: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('applies exe definition display mode to llm tool bridge sessions', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, contact_id: string],',
      '  data: [name: string],',
      '  display: {',
      '    worker: [name, { mask: "email" }],',
      '    planner: [{ ref: "email" }, { handle: "contact_id" }]',
      '  }',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", contact_id: "c-1", name: "Mark Davies" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' } with { display: "planner" }`,
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
        email: {
          value: 'mark@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        },
        contact_id: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('lets call-site display override definition and box display for a single llm session', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  facts: [email: string, contact_id: string],',
      '  data: [name: string],',
      '  display: {',
      '    worker: [name, { mask: "email" }],',
      '    planner: [{ ref: "email" }, { handle: "contact_id" }]',
      '  }',
      '}',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", contact_id: "c-1", name: "Mark Davies" }; } => contact',
      '/var @toolList = [@search_contacts]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/contacts_tools.mld"',
      '/var @cfg = { display: "planner" }',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" search_contacts '{"query":"Mark"}' } with { display: "planner" }`,
      '/box @cfg [',
      '  let @result = @agent("Find Mark", { tools: @toolList }) with { display: "worker" }',
      '  show @result',
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
        name: 'Mark Davies',
        email: {
          preview: 'm***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
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

  it('preserves imported @fyi.known arrays when passed to config.tools', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/record @contact = { facts: [email: string], data: [name: string], display: [name, { mask: "email" }] }',
      '/exe @search_contacts(query) = js { return { email: "ada@example.com", name: "Ada" }; } => contact',
      '/var @toolList = [@search_contacts, @fyi.known]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Ada"}},{"name":"known","arguments":{"query":{"op":"op:named:email.send","arg":"recipient"}}}]' }`,
      '/show @agent("Discover the allowed recipient", { tools: @toolList })'
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

  it('supports imported @fyi.known discovery for agent tool usage', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/record @contact = { facts: [email: string], data: [name: string], display: [name, { mask: "email" }] }',
      '/exe @search_contacts(query) = js { return { email: "ada@example.com", name: "Ada" }; } => contact',
      '/var @toolList = [@search_contacts, @fyi.known]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Ada"}},{"name":"known","arguments":{"query":"email.send"}}]' }`,
      '/show @agent("Discover the available known handles", { tools: @toolList })'
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
            label: 'a***@example.com',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ],
        recipients: [
          {
            handle: expect.stringMatching(HANDLE_RE),
            label: 'a***@example.com',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ],
        cc: [
          {
            handle: expect.stringMatching(HANDLE_RE),
            label: 'a***@example.com',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ],
        bcc: [
          {
            handle: expect.stringMatching(HANDLE_RE),
            label: 'a***@example.com',
            field: 'email',
            fact: 'fact:@contact.email'
          }
        ]
      });
    } finally {
      environment?.cleanup();
    }
  });

  it('lets llm guards scope discovery enforcement to contexts where the known tool is available', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com" }; } => contact',
      '/var @plannerTools = [@search_contacts, @fyi.known]',
      '/var @workerTools = [@search_contacts]',
      '/guard @requireKnown after op:llm = when [',
      '  @mx.tools.available[*].name.includes("known") && !@mx.tools.calls.includes("known") => deny "Known required"',
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
      ).rejects.toThrow(/Known required/);
    } finally {
      environment?.cleanup();
    }

    const allowSource = [
      '/record @contact = { facts: [email: string] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com" }; } => contact',
      '/var @workerTools = [@search_contacts]',
      '/guard @requireKnown after op:llm = when [',
      '  @mx.tools.available[*].name.includes("known") && !@mx.tools.calls.includes("known") => deny "Known required"',
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

  it('preserves imported @fyi.known arrays for direct tool calls', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/mcp_active.mld', [
      '/record @contact = { facts: [email: string], data: [name: string], display: [name, { mask: "email" }] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark" }; } => contact',
      '/var @toolList = [@search_contacts, @fyi.known]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}},{"name":"known","arguments":{"query":{"op":"op:named:email.send","arg":"recipient"}}}]' }`,
      '/show @agent("Discover the allowed recipient", { tools: @toolList })'
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

  it('discovers prior projected handles within one agent call via implicit known injection', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string, name: string], display: [name, { mask: "email" }] }',
      '/exe @search_contacts(query) = js { return { email: "mark@example.com", name: "Mark Davies" }; } => contact',
      '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }',
      '/var @toolList = [@search_contacts, @send_email]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolSequenceFromConfigPath}" "@mx.llm.config" '[{"name":"search_contacts","arguments":{"query":"Mark"}},{"name":"known","arguments":{"query":{"op":"send_email","arg":"recipient"}}}]' }`,
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

  it('lets authorization guards override unlocked no-untrusted-destructive denials on the llm bridge path', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    await fileSystem.writeFile('/mcp_active.mld', [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe destructive:targeted, tool:w @delete_doc(id) = [',
        '  => @mcp.echo(@id)',
      '] with { controlArgs: ["id"] }',
      '/var @toolList = [@delete_doc]',
      '/export { @toolList }'
    ].join('\n'));

    const source = [
      '/import { @toolList } from "/mcp_active.mld"',
      '/var untrusted @prompt = "Delete doc-1"',
      '/var @taskPolicy = {',
      '  defaults: { rules: ["no-untrusted-destructive"] },',
      '  operations: { destructive: ["tool:w"], "destructive:targeted": ["tool:w"] },',
      '  authorizations: {',
      '    allow: {',
      '      delete_doc: {',
      '        args: {',
      '          id: { eq: "doc-1", attestations: ["known"] }',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" delete_doc '{"id":"doc-1"}' }`,
      '/show @agent(@prompt, { tools: @toolList }) with { policy: @taskPolicy }'
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

      expect(output.trim()).toBe('doc-1');
    } finally {
      environment?.cleanup();
    }
  });

  it('creates config.system with worker tool notes when the user did not provide one', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @sendEmail(recipient, subject, body) = "sent" with { controlArgs: ["recipient"] }',
      '/exe tool:r @searchContactsByName(query) = "Ada"',
      '/var tools @toolList = {',
      '  send_email: {',
      '    mlld: @sendEmail,',
      '    expose: ["recipient", "subject", "body"],',
      '    description: "Send an outbound email"',
      '  },',
      '  search_contacts_by_name: {',
      '    mlld: @searchContactsByName,',
      '    expose: ["query"],',
      '    description: "Search contacts by name"',
      '  }',
      '}',
      '/exe llm @agent(prompt, config) = js { return config.system ?? ""; }',
      '/show @agent("Send the message", { tools: @toolList })'
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

      expect(output).toContain('<tool_notes>');
      expect(output).toContain('| Tool | Control Args | Discover Targets |');
      expect(output).toContain('| send_email | recipient | @fyi.known("send_email") |');
      expect(output).toContain('Use @fyi.known("toolName") to discover approved handle-bearing targets for control args.');
      expect(output).toContain('Read tools: search_contacts_by_name');
      expect(output).toContain('Denied: (none)');
      expect(output).not.toContain('Send an outbound email');
      expect(output).not.toContain('| Tool | Description |');
      expect(output).not.toContain('Search contacts by name');
    } finally {
      environment?.cleanup();
    }
  });

  it('appends worker tool notes after user-authored config.system content', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @sendEmail(recipient, subject, body) = "sent" with { controlArgs: ["recipient"] }',
      '/exe tool:r @searchContactsByName(query) = "Ada"',
      '/var tools @toolList = {',
      '  send_email: {',
      '    mlld: @sendEmail,',
      '    expose: ["recipient", "subject", "body"],',
      '    description: "Send an outbound email"',
      '  },',
      '  search_contacts_by_name: {',
      '    mlld: @searchContactsByName,',
      '    expose: ["query"],',
      '    description: "Search contacts by name"',
      '  }',
      '}',
      '/exe llm @agent(prompt, config) = js { return config.system ?? ""; }',
      '/show @agent("Send the message", { tools: @toolList, system: "User system prompt" })'
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

      expect(output).toContain('User system prompt\n\n<tool_notes>');
      expect(output).toContain('| send_email | recipient | @fyi.known("send_email") |');
      expect(output).toContain('Read tools: search_contacts_by_name');
      expect(output).not.toContain('Send an outbound email');
      expect(output).not.toContain('Search contacts by name');
    } finally {
      environment?.cleanup();
    }
  });

  it('injects planner tool notes with deny-list and authorization shape guidance', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @updatePassword(recipient, password) = "ok" with { controlArgs: ["recipient"] }',
      '/exe tool:r @searchContactsByName(query) = "Ada"',
      '/var tools @toolList = {',
      '  update_password: {',
      '    mlld: @updatePassword,',
      '    expose: ["recipient", "password"],',
      '    description: "Update account password"',
      '  },',
      '  search_contacts_by_name: {',
      '    mlld: @searchContactsByName,',
      '    expose: ["query"],',
      '    description: "Search contacts by name"',
      '  }',
      '}',
      '/var @taskPolicy = { authorizations: { deny: ["update_password"] } }',
      '/exe llm @planner(prompt, config) = js { return config.system ?? ""; } with { display: "planner" }',
      '/show @planner("Make a plan", { tools: @toolList }) with { policy: @taskPolicy }'
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

      expect(output).toContain('<tool_notes>');
      expect(output).toContain('| Tool | Control Args |');
      expect(output).toContain('| update_password | recipient |');
      expect(output).toContain('Read tools: search_contacts_by_name');
      expect(output).toContain('Denied: update_password');
      expect(output).toContain('Authorization intent:');
      expect(output).toContain('resolved: { tool: { arg: "handle" } }');
      expect(output).not.toContain('Use @fyi.known("toolName")');
      expect(output).not.toContain('Update account password');
      expect(output).not.toContain('Search contacts by name');
    } finally {
      environment?.cleanup();
    }
  });

  it('creates config.system with a write-tool table even when tools have no control args', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe tool:w @createDraft(subject, body) = "draft" with { controlArgs: [] }',
      '/var @toolList = [@createDraft]',
      '/exe llm @agent(prompt, config) = js { return JSON.stringify(config.system ?? null); }',
      '/show @agent("Draft a note", { tools: @toolList })'
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

      expect(output).toContain('<tool_notes>');
      expect(output).toContain('| Tool | Control Args | Discover Targets |');
      expect(output).toContain('| create_draft | (none) |  |');
      expect(output).toContain('Denied: (none)');
      expect(output).not.toContain('Use @fyi.known("toolName")');
    } finally {
      environment?.cleanup();
    }
  });

});
