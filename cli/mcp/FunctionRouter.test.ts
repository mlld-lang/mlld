import { describe, expect, it } from 'vitest';
import { FunctionRouter } from './FunctionRouter';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { ToolCollection } from '@core/types/tools';
import { makeSecurityDescriptor } from '@core/types/security';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

async function readAuditEvents(environment: Environment): Promise<Array<Record<string, unknown>>> {
  const contents = await environment.getFileSystemService().readFile('/.mlld/sec/audit.jsonl');
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

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

  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment for MCP function routing');
  }
  const moduleEnv = environment.captureModuleEnvironment();

  for (const variable of environment.getAllVariables().values()) {
    if (variable.type !== 'executable') continue;
    const internal = variable.internal;
    if (internal?.isSystem || internal?.isBuiltinTransformer) continue;
    if (!internal) {
      variable.internal = { capturedModuleEnv: moduleEnv };
    } else if (!internal.capturedModuleEnv) {
      internal.capturedModuleEnv = moduleEnv;
    }
  }

  return environment;
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

  it('serializes record-coerced results through display projections', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string, name: string, phone: string?],
        data: [notes: string?],
        display: [name, { mask: "email" }]
      }

      /exe @getContact() = js {
        return {
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          phone: '+1-555-0142',
          notes: 'Met at conference'
        };
      } => contact

      /export { @getContact }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('get_contact', {});

    expect(JSON.parse(result)).toEqual({
      name: 'Ada Lovelace',
      email: {
        preview: 'a***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('serializes arrays of record-coerced results element-by-element', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string, name: string],
        display: [name, { mask: "email" }]
      }

      /exe @listContacts() = js {
        return [
          { email: 'ada@example.com', name: 'Ada' },
          { email: 'grace@example.com', name: 'Grace' }
        ];
      } => contact

      /export { @listContacts }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('list_contacts', {});

    expect(JSON.parse(result)).toEqual([
      {
        name: 'Ada',
        email: {
          preview: 'a***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      {
        name: 'Grace',
        email: {
          preview: 'g***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      }
    ]);
  });

  it('issues handles for display-projected fact fields while serializing tool results', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string, name: string],
        display: [name, { mask: "email" }]
      }

      /exe @getContact() = js {
        return { email: 'ada@example.com', name: 'Ada Lovelace' };
      } => contact

      /export { @getContact }
    `);

    environment.setLlmToolConfig({
      sessionId: 'router-projection-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      inBox: false,
      cleanup: async () => {}
    });

    const router = new FunctionRouter({ environment });
    await router.executeFunction('get_contact', {});

    expect(environment.getIssuedHandles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: expect.stringMatching(HANDLE_RE),
          preview: 'a***@example.com',
          metadata: expect.objectContaining({
            field: 'email',
            record: 'contact'
          })
        })
      ])
    );
  });

  it('narrows projected handles against the active tool list and policy', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string, name: string],
        display: [name, { mask: "email" }]
      }

      /exe @getContact() = js {
        return { email: 'ada@example.com', name: 'Ada Lovelace' };
      } => contact

      /exe exfil:send, tool:w @send_email(recipient, subject, body) = js {
        return 'sent';
      } with { controlArgs: ["recipient"] }

      /exe @archive_contact(contact) = js {
        return 'archived';
      }

      /export { @getContact, @send_email, @archive_contact }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-send-to-external'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);

    const plannerRouter = new FunctionRouter({
      environment,
      toolCollection: {
        get_contact: { mlld: 'getContact' },
        send_email: { mlld: 'send_email', controlArgs: ['recipient'] }
      }
    });
    const workerRouter = new FunctionRouter({
      environment,
      toolCollection: {
        get_contact: { mlld: 'getContact' },
        archive_contact: { mlld: 'archive_contact' }
      }
    });

    expect(JSON.parse(await plannerRouter.executeFunction('get_contact', {}))).toEqual({
      name: 'Ada Lovelace',
      email: {
        preview: 'a***@example.com'
      }
    });
    expect(JSON.parse(await workerRouter.executeFunction('get_contact', {}))).toEqual({
      name: 'Ada Lovelace',
      email: {
        preview: 'a***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('forces handle-only fact projection when scoped display strict mode is active', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string, name: string],
        data: [notes: string?],
        display: [name, { mask: "email" }]
      }

      /exe @getContact() = js {
        return {
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          notes: 'Visible'
        };
      } => contact

      /export { @getContact }
    `);

    environment.setScopedEnvironmentConfig({
      display: 'strict',
      tools: {
        get_contact: { mlld: 'getContact' }
      }
    });

    const router = new FunctionRouter({
      environment,
      toolCollection: {
        get_contact: { mlld: 'getContact' }
      }
    });

    expect(JSON.parse(await router.executeFunction('get_contact', {}))).toEqual({
      email: {
        handle: expect.stringMatching(HANDLE_RE)
      },
      name: {
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
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

  it('preserves object arguments', async () => {
    const environment = await createEnvironment(`
      /exe @inspect(value) = js {
        return { kind: typeof value, foo: value.foo };
      }

      /export { @inspect }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('inspect', { value: { foo: 'bar' } });

    expect(JSON.parse(result)).toEqual({ kind: 'object', foo: 'bar' });
  });

  it('preserves array arguments', async () => {
    const environment = await createEnvironment(`
      /exe @inspect(value) = js {
        return { isArray: Array.isArray(value), size: value.length };
      }

      /export { @inspect }
    `);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('inspect', { value: [1, 2, 3] });

    expect(JSON.parse(result)).toEqual({ isArray: true, size: 3 });
  });

  it('throws when function is not found', async () => {
    const environment = await createEnvironment('/export { }');
    const router = new FunctionRouter({ environment });

    await expect(router.executeFunction('missing_tool', {})).rejects.toThrow("Tool not found: 'missing_tool'");
  });

  it('returns a tool-not-found suggestion before invocation when MCP name casing is wrong', async () => {
    const environment = await createEnvironment(`
      /exe @greetUser(name) = js {
        return 'Hello ' + name;
      }

      /export { @greetUser }
    `);

    const router = new FunctionRouter({
      environment,
      toolNames: ['greet_user'],
      toolNamesAreMcp: true
    });

    await expect(router.executeFunction('greetUser', { name: 'Ada' })).rejects.toThrow(
      "Tool not found: 'greetUser'. Did you mean 'greet_user'?"
    );
  });

  it('exposes @input imports during execution', async () => {
    process.env.MLLD_TEST_VAR = 'from-env';

    const environment = await createEnvironment(`
      /import { @MLLD_TEST_VAR } from @input

      /exe @showVar() = js {
        return 'Value: ' + MLLD_TEST_VAR;
      }

      /export { @showVar }
    `);

    const envVar = environment.getVariable('MLLD_TEST_VAR');
    expect(envVar).toBeDefined();

    const exported = environment.getVariable('showVar');
    expect(exported?.internal?.capturedModuleEnv).toBeInstanceOf(Map);

    const router = new FunctionRouter({ environment });
    const result = await router.executeFunction('show_var', {});

    expect(result).toBe('Value: from-env');

    delete process.env.MLLD_TEST_VAR;
  });

  it('does not apply src:mcp taint to function result for MCP-served tools', async () => {
    const environment = await createEnvironment(`
      /exe @storeResult(value) = js {
        return { result: value, processed: true };
      }

      /export { @storeResult }
    `);

    const router = new FunctionRouter({ environment });
    await router.executeFunction('store_result', { value: 'test-data' });

    const securitySnapshot = environment.getSecuritySnapshot();
    expect(securitySnapshot).toBeDefined();
    expect(securitySnapshot?.taint ?? []).not.toContain('src:mcp');
    expect(securitySnapshot?.sources ?? []).not.toContain('mcp:storeResult');
  });

  it('does not apply src:mcp taint for zero-arg MCP-served functions', async () => {
    const environment = await createEnvironment(`
      /exe @getTime() = js {
        return new Date().toISOString();
      }

      /export { @getTime }
    `);

    const router = new FunctionRouter({ environment });
    await router.executeFunction('get_time', {});

    const securitySnapshot = environment.getSecuritySnapshot();
    expect(securitySnapshot).toBeDefined();
    expect(securitySnapshot?.taint ?? []).not.toContain('src:mcp');
    expect(securitySnapshot?.sources ?? []).not.toContain('mcp:getTime');
  });

  it('does not rebind known attestations from prior native tool results without handles', async () => {
    const environment = await createEnvironment(`
      /exe known @getIban() = js {
        return 'acct-good';
      }

      /exe exfil:send, tool:w @sendMoney(recipient, amount) = js {
        return 'sent ' + amount + ' to ' + recipient;
      } with { controlArgs: ["recipient"] }

      /export { @getIban, @sendMoney }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);

    const router = new FunctionRouter({
      environment,
      toolNames: ['getIban', 'sendMoney']
    });

    await expect(router.executeFunction('get_iban', {})).resolves.toBe('acct-good');
    await expect(
      router.executeFunction('send_money', { recipient: 'acct-good', amount: 100 })
    ).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('does not smear known attestations from one native tool result onto unrelated later args', async () => {
    const environment = await createEnvironment(`
      /exe known @getIban() = js {
        return 'acct-good';
      }

      /exe exfil:send, tool:w @sendMoney(recipient, amount) = js {
        return 'sent ' + amount + ' to ' + recipient;
      } with { controlArgs: ["recipient"] }

      /export { @getIban, @sendMoney }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);

    const router = new FunctionRouter({
      environment,
      toolNames: ['getIban', 'sendMoney']
    });

    await router.executeFunction('get_iban', {});
    await expect(
      router.executeFunction('send_money', { recipient: 'evil-iban', amount: 25 })
    ).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('does not authorize bare fact literals from prior native tool results', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [email: string],
        display: [email]
      }

      /exe @getContact() = js {
        return { email: 'ada@example.com' };
      } => contact

      /exe exfil:send, tool:w @send_email(recipient, subject, body) = js {
        return 'sent ' + subject + ' to ' + recipient;
      } with { controlArgs: ["recipient"] }

      /export { @getContact, @send_email }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);

    const router = new FunctionRouter({
      environment,
      toolCollection: {
        get_contact: { mlld: 'getContact' },
        send_email: { mlld: 'send_email', controlArgs: ['recipient'] }
      }
    });

    await expect(router.executeFunction('get_contact', {})).resolves.toContain('ada@example.com');
    await expect(
      router.executeFunction('send_email', {
        recipient: 'ada@example.com',
        subject: 'hello',
        body: 'test'
      })
    ).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('does not let handle-backed untrusted fact values bypass no-untrusted-destructive', async () => {
    const environment = await createEnvironment(`
      /record @tx = {
        facts: [recipient: string],
        data: [subject: string?],
        display: [{ mask: "recipient" }]
      }

      /exe untrusted @getTx() = js {
        return {
          recipient: 'US122000000121212121212',
          subject: 'Monthly rent'
        };
      } => tx

      /exe tool:w @updateTx(recipient) = js {
        return 'updated:' + recipient;
      } with { controlArgs: ["recipient"] }

      /export { @getTx, @updateTx }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { destructive: ['tool:w'] }
    } as any);
    environment.setLlmToolConfig({
      sessionId: 'router-tx-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      inBox: false,
      cleanup: async () => {}
    });

    const router = new FunctionRouter({
      environment,
      toolCollection: {
        get_tx: { mlld: 'getTx' },
        update_tx: { mlld: 'updateTx', controlArgs: ['recipient'] }
      }
    });

    const getTxResult = JSON.parse(await router.executeFunction('get_tx', {})) as {
      recipient: { preview: string; handle: string };
    };
    expect(getTxResult.recipient).toEqual({
      preview: 'US1***21212',
      handle: expect.stringMatching(HANDLE_RE)
    });
    await expect(
      router.executeFunction('update_tx', { recipient: getTxResult.recipient.handle })
    ).rejects.toThrow(/cannot flow to 'destructive'/i);
  });

  it('fails closed on bare projected literals during native tool calls', async () => {
    const environment = await createEnvironment(`
      /record @contact = {
        facts: [name: string],
        display: [name]
      }

      /exe @getContactA() = js {
        return { name: 'Charlie' };
      } => contact

      /exe @getContactB() = js {
        return { name: 'Charlie' };
      } => contact

      /exe exfil:send, tool:w @sendEmail(recipient, subject, body) = js {
        return 'sent';
      } with { controlArgs: ["recipient"] }

      /export { @getContactA, @getContactB, @sendEmail }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);
    environment.setLlmToolConfig({
      sessionId: 'router-ambiguous-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      inBox: false,
      cleanup: async () => {}
    });

    const router = new FunctionRouter({
      environment,
      toolCollection: {
        get_contact_a: { mlld: 'getContactA' },
        get_contact_b: { mlld: 'getContactB' },
        send_email: { mlld: 'sendEmail', controlArgs: ['recipient'] }
      }
    });

    await router.executeFunction('get_contact_a', {});
    await router.executeFunction('get_contact_b', {});

    try {
      await router.executeFunction('send_email', {
        recipient: 'Charlie',
        subject: 'hi',
        body: 'test'
      });
      throw new Error('Expected send_email to be denied');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/destination must carry 'known'/i);
      expect(message).not.toMatch(/Ambiguous/i);
    }
  });

  it('resolves arrays of handles for destructive tool calls', async () => {
    const environment = await createEnvironment(`
      /record @calendar_evt = {
        facts: [participants: array],
        data: [title: string?],
        display: [{ mask: "participants" }]
      }

      /exe untrusted @getEvent() = js {
        return {
          participants: ['ada@example.com', 'grace@example.com'],
          title: 'Lunch'
        };
      } => calendar_evt

      /exe tool:w @updateParticipants(participants) = js {
        return JSON.stringify(participants);
      } with { controlArgs: ["participants"] }

      /export { @getEvent, @updateParticipants }
    `);

    environment.setPolicySummary({
      defaults: { rules: ['no-untrusted-destructive'] },
      operations: { destructive: ['tool:w'] }
    } as any);
    environment.setLlmToolConfig({
      sessionId: 'router-array-session',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      inBox: false,
      cleanup: async () => {}
    });

    const router = new FunctionRouter({
      environment,
      toolCollection: {
        get_event: { mlld: 'getEvent' },
        update_participants: { mlld: 'updateParticipants', controlArgs: ['participants'] }
      }
    });

    const eventResult = JSON.parse(await router.executeFunction('get_event', {})) as {
      participants: Array<{ preview: string; handle: string }>;
    };
    expect(eventResult.participants).toEqual([
      {
        preview: 'a***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      },
      {
        preview: 'g***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      }
    ]);
    await expect(
      router.executeFunction('update_participants', {
        participants: eventResult.participants.map(entry => entry.handle)
      })
    ).resolves.toBe('["ada@example.com","grace@example.com"]');
  });

  it('does not expose src:mcp taint to guards for MCP-served inputs', async () => {
    const environment = await createEnvironment(`
      /guard @blockMcp before op:exe = when [
        @mx.taint.includes("src:mcp") && @mx.sources.includes("mcp:getTime") => deny "MCP blocked"
        * => allow
      ]

      /exe @getTime() = js {
        return new Date().toISOString();
      }

      /export { @getTime }
    `);

    const router = new FunctionRouter({ environment });
    await expect(router.executeFunction('get_time', {})).resolves.toEqual(expect.any(String));
  });

  it('propagates prior tool-result labels into later tool call args', async () => {
    const environment = await createEnvironment(`
      /policy @p = {
        defaults: { rules: ["untrusted-llms-get-influenced", "no-untrusted-destructive"] },
        operations: { destructive: ["tool:w"] }
      }

      /exe untrusted @readData() = [
        => "The rent is $1100 to recipient US122"
      ]

      /exe tool:w @writeData(value) = [
        => { wrote: @value }
      ]

      /export { @readData, @writeData }
    `);

    const router = new FunctionRouter({ environment });
    const readResult = await router.executeFunction('read_data', {});

    await expect(
      router.executeFunction('write_data', { value: readResult })
    ).rejects.toThrow(/untrusted|destructive|influenced/i);
  });

  it('applies initial conversation labels to the first tool call', async () => {
    const environment = await createEnvironment(`
      /policy @p = {
        defaults: { rules: ["untrusted-llms-get-influenced", "no-untrusted-destructive"] },
        operations: { destructive: ["tool:w"] }
      }

      /exe tool:w @writeData(value) = [
        => { wrote: @value }
      ]

      /export { @writeData }
    `);

    const router = new FunctionRouter({
      environment,
      conversationDescriptor: makeSecurityDescriptor({ labels: ['untrusted'] })
    });

    await expect(
      router.executeFunction('write_data', { value: 'generated from prompt' })
    ).rejects.toThrow(/untrusted|destructive|influenced/i);
  });

  it('tracks tool calls in @mx.tools.calls', async () => {
    const environment = await createEnvironment(`
      /guard @limitCalls before op:exe = when [
        @mx.tools.calls.length >= 1 => deny "Too many calls"
        * => allow
      ]

      /exe @greet(name) = js {
        return 'Hello ' + name;
      }

      /export { @greet }
    `);

    const router = new FunctionRouter({ environment });
    await expect(router.executeFunction('greet', { name: 'Ada' })).resolves.toBe('Hello Ada');
    await expect(router.executeFunction('greet', { name: 'Grace' })).rejects.toThrow('Too many calls');
  });

  it('writes a single toolCall audit event for router-owned native tool calls', async () => {
    const environment = await createEnvironment(`
      /exe @greet(name) = js {
        return 'Hello ' + name;
      }

      /export { @greet }
    `);

    const router = new FunctionRouter({ environment });
    await expect(router.executeFunction('greet', { name: 'Ada' })).resolves.toBe('Hello Ada');

    const toolCallEvents = (await readAuditEvents(environment)).filter(
      event => event.event === 'toolCall' && event.tool === 'greet'
    );

    expect(toolCallEvents).toHaveLength(1);
    expect(toolCallEvents[0]).toMatchObject({
      tool: 'greet',
      ok: true,
      args: { name: 'Ada' }
    });
  });

  it('supports optional exposed tool parameters', async () => {
    const environment = await createEnvironment(`
      /exe @verify(vars) = js {
        return vars === undefined ? 'default' : vars;
      }

      /export { @verify }
    `);

    const toolCollection: ToolCollection = {
      verify: { mlld: 'verify', expose: ['vars'], optional: ['vars'] }
    };
    const router = new FunctionRouter({ environment, toolCollection });

    await expect(router.executeFunction('verify', {})).resolves.toBe('default');
    await expect(router.executeFunction('verify', { vars: 'prompt' })).resolves.toBe('prompt');
  });

  it('tracks structured tool results in @mx.tools.results', async () => {
    const environment = await createEnvironment(`
      /guard @requirePassingVerify before op:exe = when [
        @mx.tools.results.verify != null && @mx.tools.results.verify.allPassed == false => deny "verify failed"
        * => allow
      ]

      /exe @verify(status) = js {
        return { allPassed: status === 'ok', status };
      }

      /export { @verify }
    `);

    const router = new FunctionRouter({ environment });
    const firstResult = await router.executeFunction('verify', { status: 'bad' });
    expect(JSON.parse(firstResult)).toMatchObject({ allPassed: false, status: 'bad' });

    const toolsSnapshot = environment.getContextManager().getToolsSnapshot();
    expect((toolsSnapshot.results as any).verify).toMatchObject({ allPassed: false, status: 'bad' });

    await expect(router.executeFunction('verify', { status: 'ok' })).rejects.toThrow('verify failed');
  });
});
