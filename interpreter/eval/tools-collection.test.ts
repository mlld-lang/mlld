import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';
import type { ToolCollection } from '@core/types/tools';
import { FunctionRouter } from '@cli/mcp/FunctionRouter';
import { fileURLToPath } from 'url';
import { getCapturedModuleEnv } from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { isExecutableVariable, isRecordVariable } from '@core/types/variable';

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
} as const;

async function interpretWithEnv(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

async function interpretWithEnvAndFiles(
  source: string,
  files: Record<string, string>
): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  for (const [filePath, content] of Object.entries(files)) {
    await fileSystem.writeFile(filePath, content);
  }

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

function getVisibleToolExecutableName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    return (value as { name?: string }).name;
  }
  return undefined;
}

function getVisibleToolInputName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && isRecordVariable(value as any)) {
    return (value as { name?: string }).name;
  }
  return isPlainRecordDefinition(value) ? value.name : undefined;
}

function isPlainRecordDefinition(value: unknown): value is { name: string; fields: unknown[] } {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as { name?: unknown }).name === 'string'
    && Array.isArray((value as { fields?: unknown }).fields)
  );
}

describe('tool collections', () => {
  it('creates tool collection entries from input records', async () => {
    const env = await interpretWithEnv(`
      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string, body: string?],
        validate: "strict"
      }

      /exe @send_email(recipient, subject, body, api_key) = js {
        return { recipient, subject, body, api_key };
      }

      /var tools @agentTools = {
        send_email: {
          mlld: @send_email,
          inputs: @send_email_inputs,
          labels: ["tool:w", "comm:w"],
          description: "Send mail",
          instructions: "Prefer drafts first.",
          can_authorize: "role:planner",
          bind: { api_key: "sekret" }
        }
      }
    `);

    const toolsVar = env.getVariable('agentTools');
    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(isExecutableVariable(collection.send_email.mlld as any)).toBe(true);
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('send_email');
    expect(getVisibleToolInputName(collection.send_email.inputs)).toBe('send_email_inputs');
    expect(collection.send_email).toMatchObject({
      labels: ['tool:w', 'comm:w'],
      description: 'Send mail',
      instructions: 'Prefer drafts first.',
      can_authorize: 'role:planner'
    });
  });

  it('supports bare executable shorthand entries in var tools', async () => {
    const env = await interpretWithEnv(`
      /exe @send_email(recipient, subject) = js {
        return \`sent:\${recipient}:\${subject}\`;
      }

      /var tools @agentTools = {
        send_email: @send_email
      }

      /var @result = @agentTools.send_email("ada@example.com", "Hello")
    `);

    const collection = env.getVariable('agentTools')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('send_email');

    const resolved = await extractVariableValue(env.getVariable('result') as any, env);
    expect((resolved as any)?.text ?? resolved).toBe('sent:ada@example.com:Hello');
  });

  it('preserves returns and arbitrary metadata keys on var tools entries while keeping dispatch callable', async () => {
    const env = await interpretWithEnv(`
      /record @search_contacts_inputs = {
        data: [query: string],
        validate: "strict"
      }

      /record @contact = {
        facts: [email: string],
        data: [name: string]
      }

      /exe @search_contacts(query) = js {
        return \`found:\${query}\`;
      }

      /var tools @catalog = {
        search_contacts: {
          mlld: @search_contacts,
          inputs: @search_contacts_inputs,
          returns: @contact,
          labels: ["resolve:r"],
          kind: "read",
          semantics: "Search contacts.",
          description: "Search contacts.",
          can_authorize: false,
          custom_meta: { x: 1 }
        }
      }

      /var @result = @catalog.search_contacts("Ada")
    `);

    const collection = env.getVariable('catalog')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.search_contacts.mlld)).toBe('search_contacts');
    expect(getVisibleToolInputName(collection.search_contacts.inputs)).toBe('search_contacts_inputs');
    expect(getVisibleToolInputName(collection.search_contacts.returns as any)).toBe('contact');
    expect((collection.search_contacts as Record<string, unknown>).kind).toBe('read');
    expect((collection.search_contacts as Record<string, unknown>).semantics).toBe('Search contacts.');
    expect((collection.search_contacts as Record<string, any>).custom_meta).toEqual({ x: 1 });

    const resolved = await extractVariableValue(env.getVariable('result') as any, env);
    expect((resolved as any)?.text ?? resolved).toBe('found:Ada');
  });

  it('rejects orphan executable parameters when inputs records leave them uncovered', async () => {
    await expect(
      interpretWithEnv(`
        /record @send_email_inputs = {
          facts: [recipient: string],
          data: [subject: string],
          validate: "strict"
        }
        /exe @send_email(recipient, subject, body) = js { return body; }
        /var tools @badTools = {
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs
          }
        }
      `)
    ).rejects.toThrow(/cover all parameters/i);
  });

  it('rejects bound params that are also declared in the input record', async () => {
    await expect(
      interpretWithEnv(`
        /record @send_email_inputs = {
          facts: [recipient: string],
          data: [subject: string],
          validate: "strict"
        }
        /exe @send_email(recipient, subject) = js { return subject; }
        /var tools @badTools = {
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs,
            bind: { subject: "hidden" }
          }
        }
      `)
    ).rejects.toThrow(/bind cannot include input-record fields/i);
  });

  it('allows legacy control arg metadata to live on the tool entry when the wrapper exe is metadata-free', async () => {
    const env = await interpretWithEnv(`
      /exe @runtime_send_email(recipients, cc, bcc, subject) = js {
        return { recipients, cc, bcc, subject };
      }

      /var tools @writeTools = {
        send_email: {
          mlld: @runtime_send_email,
          expose: ["recipients", "cc", "bcc", "subject"],
          controlArgs: ["recipients", "cc", "bcc"]
        }
      }
    `);

    const collection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('runtime_send_email');
    expect(collection.send_email.expose).toEqual(['recipients', 'cc', 'bcc', 'subject']);
    expect(collection.send_email.controlArgs).toEqual(['recipients', 'cc', 'bcc']);
  });

  it('resolves imported record refs when a local tool collection uses inputs', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @send_email_inputs } from "/records.mld"

        /exe @send_email(recipient, subject, body) = js {
          return { recipient, subject, body };
        }

        /var tools @writeTools = {
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs
          }
        }
      `,
      {
        '/records.mld': `
          /record @send_email_inputs = {
            facts: [recipient: string],
            data: [subject: string, body: string],
            validate: "strict"
          }

          /export { @send_email_inputs }
        `
      }
    );

    const collection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('send_email');
    expect(getVisibleToolInputName(collection.send_email.inputs)).toBe('send_email_inputs');
  });

  it('preserves imported read-entry metadata inside a mixed local tool collection', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @tools } from "/provider.mld"

        /record @send_email_inputs = {
          facts: [recipient: string],
          data: [subject: string],
          validate: "strict"
        }

        /exe @send_email(recipient, subject) = js {
          return \`sent:\${recipient}:\${subject}\`;
        }

        /var tools @agentTools = {
          get_contacts: @tools.get_contacts,
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs,
            labels: ["execute:w"],
            can_authorize: "role:planner"
          }
        }

        /var @readResult = @agentTools.get_contacts()
      `,
      {
        '/provider.mld': `
          /record @contact = {
            facts: [email: string],
            data: [name: string]
          }

          /exe resolve:r @get_contacts() = [
            => [{ email: "alice@example.com", name: "Alice" }]
          ] => record @contact

          /var @tools = {
            get_contacts: {
              kind: "read",
              mlld: @get_contacts,
              returns: @contact,
              labels: ["resolve:r"],
              expose: [],
              semantics: "Load contacts."
            }
          }

          /export { @tools }
        `
      }
    );

    const collection = env.getVariable('agentTools')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.get_contacts.mlld)).toBe('get_contacts');
    expect(getVisibleToolInputName(collection.get_contacts.returns as any)).toBe('contact');
    expect((collection.get_contacts as Record<string, unknown>).kind).toBe('read');
    expect((collection.get_contacts as Record<string, unknown>).semantics).toBe('Load contacts.');
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('send_email');
    expect(getVisibleToolInputName(collection.send_email.inputs)).toBe('send_email_inputs');

    expect(env.getVariable('readResult')).toBeDefined();
  });

  it('resolves namespace field refs in mlld tool entries to the executable they point at', async () => {
    const normalizedEnv = await interpretWithEnvAndFiles(
      `
        /import { @workspaceTools } from "/provider.mld"

        /var tools @writeTools = {
          send_email: {
            mlld: @workspaceTools.sendEmail,
            expose: ["recipient"]
          }
        }
      `,
      {
        '/provider.mld': `
          /exe @sendEmail(recipient) = \`sent:@recipient\`

          /var @workspaceTools = {
            sendEmail: @sendEmail
          }

          /export { @workspaceTools }
        `
      }
    );

    const normalizedCollection =
      normalizedEnv.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    const definitionCaptured = getCapturedModuleEnv(normalizedCollection.send_email);
    const collectionCaptured = getCapturedModuleEnv(normalizedCollection);
    expect(definitionCaptured instanceof Map && definitionCaptured.has('sendEmail')).toBe(true);
    expect(collectionCaptured instanceof Map && collectionCaptured.has('sendEmail')).toBe(true);

    const env = await interpretWithEnvAndFiles(
      `
        /import { @workspaceTools } from "/provider.mld"

        /var tools @writeTools = {
          send_email: {
            mlld: @workspaceTools.sendEmail,
            expose: ["recipient"]
          }
        }

        /var @result = @writeTools["send_email"]("ada@example.com")
      `,
      {
        '/provider.mld': `
          /exe @sendEmail(recipient) = \`sent:@recipient\`

          /var @workspaceTools = {
            sendEmail: @sendEmail
          }

          /export { @workspaceTools }
        `
      }
    );

    const collection = env.getVariable('writeTools')?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.send_email.mlld)).toBe('sendEmail');
    expect(collection.send_email.expose).toEqual(['recipient']);

    const resolved = await extractVariableValue(env.getVariable('result') as any, env);
    expect((resolved as any)?.text ?? resolved).toBe('sent:ada@example.com');
  });

  it('creates tool collection variables with validated entries', async () => {
    const env = await interpretWithEnv(`
      /exe @readData(id: string) = js { return id; }
      /exe @deleteData(id: string) = js { return id; }
      /var tools @agentTools = {
        read: { mlld: @readData },
        delete: { mlld: @deleteData, labels: ["destructive"], expose: ["id"] }
      }
    `);

    const toolsVar = env.getVariable('agentTools');
    expect(toolsVar?.type).toBe('object');
    expect(toolsVar?.internal?.isToolsCollection).toBe(true);

    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.read.mlld)).toBe('readData');
    expect(collection.delete.labels).toEqual(['destructive']);
    expect(collection.delete.expose).toEqual(['id']);
  });

  it('rejects invalid bind keys', async () => {
    await expect(
      interpretWithEnv(`
        /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
        /var tools @badTools = {
          createIssue: { mlld: @createIssue, bind: { owner: "mlld", extra: "nope" } }
        }
      `)
    ).rejects.toThrow(/bind keys/i);
  });

  it('passes through legacy expose metadata without runtime validation', async () => {
    const env = await interpretWithEnv(`
      /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
      /var tools @badTools = {
        createIssue: { mlld: @createIssue, expose: ["title", "missing"] }
      }
    `);

    const collection = env.getVariable('badTools')?.internal?.toolCollection as ToolCollection;
    expect(collection.createIssue.expose).toEqual(['title', 'missing']);
  });

  it('passes through legacy expose metadata even when it overlaps bind', async () => {
    const env = await interpretWithEnv(`
      /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
      /var tools @badTools = {
        createIssue: { mlld: @createIssue, bind: { owner: "mlld" }, expose: ["owner", "title"] }
      }
    `);

    const collection = env.getVariable('badTools')?.internal?.toolCollection as ToolCollection;
    expect(collection.createIssue.bind).toEqual({ owner: 'mlld' });
    expect(collection.createIssue.expose).toEqual(['owner', 'title']);
  });

  it('passes through legacy expose metadata that skips required parameters', async () => {
    const env = await interpretWithEnv(`
      /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
      /var tools @badTools = {
        createIssue: { mlld: @createIssue, expose: ["title"] }
      }
    `);

    const collection = env.getVariable('badTools')?.internal?.toolCollection as ToolCollection;
    expect(collection.createIssue.expose).toEqual(['title']);
  });

  it('accepts optional values when they are exposed parameters', async () => {
    const env = await interpretWithEnv(`
      /exe @verify(vars: string) = js { return vars; }
      /var tools @agentTools = {
        verify: { mlld: @verify, expose: ["vars"], optional: ["vars"] }
      }
    `);

    const toolsVar = env.getVariable('agentTools');
    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(collection.verify.optional).toEqual(['vars']);
  });

  it('passes through legacy optional metadata without runtime validation', async () => {
    const env = await interpretWithEnv(`
      /exe @verify(vars: string) = js { return vars; }
      /var tools @badTools = {
        verify: { mlld: @verify, optional: ["vars"] }
      }
    `);

    const collection = env.getVariable('badTools')?.internal?.toolCollection as ToolCollection;
    expect(collection.verify.optional).toEqual(['vars']);
  });

  it('does not evaluate net:r guards during var tools normalization', async () => {
    const env = await interpretWithEnv(`
      /guard @noSecretExfil before net:r = when [
        @input.any.mx.labels.includes("secret") => deny "Secret data cannot flow to network operations"
        * => allow
      ]
      /exe net:r @guardedFetch(url: string) = [
        => @url
      ]
      /var tools @tools = {
        guardedFetch: { mlld: @guardedFetch, labels: ["net:r"], expose: ["url"] }
      }
    `);

    const toolsVar = env.getVariable('tools');
    expect(toolsVar?.internal?.isToolsCollection).toBe(true);
    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(getVisibleToolExecutableName(collection.guardedFetch.mlld)).toBe('guardedFetch');
  });

  it('does not inherit tool labels into collection taint when passed as params', async () => {
    const env = await interpretWithEnv(`
      /exe untrusted @searchWeb(q: string) = js { return q; }
      /exe destructive @deleteDoc(id: string) = js { return id; }

      /var tools @agentTools = {
        searchWeb: { mlld: @searchWeb, labels: ["untrusted"], expose: ["q"] },
        deleteDoc: { mlld: @deleteDoc, labels: ["destructive"], expose: ["id"] }
      }

      /guard @destructiveGate before destructive = when [
        @mx.taint.includes("untrusted") => deny "Blocked"
        * => allow
      ]

      /exe @agent(tools, task) = box with { tools: @tools } [
        => @task
      ]

      /var @result = @agent(@agentTools, "hello")
    `);

    const toolsVar = env.getVariable('agentTools');
    expect(toolsVar?.mx.taint ?? []).not.toContain('untrusted');
    expect(toolsVar?.mx.taint ?? []).not.toContain('destructive');
    expect(toolsVar?.mx.labels ?? []).not.toContain('untrusted');
    expect(toolsVar?.mx.labels ?? []).not.toContain('destructive');

    const resultVar = env.getVariable('result');
    expect((resultVar?.value as any)?.text ?? resultVar?.value).toBe('hello');
  });

  it('preserves tool collection wrapper metadata when passed through exe params', async () => {
    const output = await interpret(`
      /exe tool:w @send_email(recipient, subject) = \`sent:@recipient:@subject\`
        with { controlArgs: ["recipient"] }

      /var tools @agentTools = {
        send_email: {
          mlld: @send_email,
          expose: ["recipient", "subject"],
          controlArgs: ["recipient"]
        }
      }

      /exe @inspect(tools) = js {
        return JSON.stringify({
          isToolsCollection: mlld.getInternal(tools)?.isToolsCollection === true,
          toolNames: Object.keys(mlld.getInternal(tools)?.toolCollection ?? {})
        });
      }

      /show @inspect(@agentTools)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      isToolsCollection: true,
      toolNames: ['send_email']
    });
  });

  it('applies tool collection labels as taint on direct box-block returns', async () => {
    const result = await interpret(`
      /exe @tcRead(id: string) = \`data:@id\`

      /var tools @tcTools = {
        read: { mlld: @tcRead, labels: ["untrusted"] }
      }

      /exe @tcAgent(tools, task) = box with { tools: @tools } [
        => @tcRead("123")
      ]

      /var @tcOutput = @tcAgent(@tcTools, "go")
      /show @tcOutput.mx.taint.includes("untrusted")
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });
    expect(result.trim()).toBe('true');
  });

  it('applies tool collection labels as taint on let-bound box-block calls', async () => {
    const result = await interpret(`
      /exe @tcRead(id: string) = \`data:@id\`

      /var tools @tcTools = {
        read: { mlld: @tcRead, labels: ["untrusted"] }
      }

      /exe @tcAgent(tools, task) = box with { tools: @tools } [
        let @result = @tcRead("123")
        => @result
      ]

      /var @tcOutput = @tcAgent(@tcTools, "go")
      /show @tcOutput.mx.taint.includes("untrusted")
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });
    expect(result.trim()).toBe('true');
  });

  it('keeps destructive guard behavior for actual destructive tool calls', async () => {
    await expect(
      interpretWithEnv(`
        /exe destructive @deleteDoc(id: string) = js { return id; }

        /var tools @agentTools = {
          deleteDoc: { mlld: @deleteDoc, labels: ["destructive"], expose: ["id"] }
        }

        /guard @blockDestructive before destructive = when [
          * => deny "blocked"
        ]

        /exe @agent(tools, id) = box with { tools: @tools } [
          => @deleteDoc(@id)
        ]

        /var @result = @agent(@agentTools, "doc-1")
      `)
    ).rejects.toThrow(/blocked/i);
  });

  it('propagates matched authorization attestations on box tool collection calls', async () => {
    const output = await interpret(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @get_contact() = { email: "mark@example.com", name: "Mark Davies" } => contact

      /exe tool:w @send_email(recipients, cc, bcc, subject) = \`sent:@subject\`
        with { controlArgs: ["recipients", "cc", "bcc"] }

      /var tools @agentTools = {
        send_email: {
          mlld: @send_email,
          labels: ["tool:w:send_email"],
          expose: ["recipients", "cc", "bcc", "subject"],
          controlArgs: ["recipients", "cc", "bcc"]
        }
      }

      /exe @agent(tools) = box with { tools: @tools } [
        => @send_email(["mark@example.com"], [], [], "hello")
      ]

      /var @contact = @get_contact()
      /var @taskPolicy = {
        defaults: { rules: ["no-send-to-unknown"] },
        operations: {
          "exfil:send": ["tool:w:send_email"]
        },
        authorizations: {
          allow: {
            send_email: {
              args: {
                recipients: [@contact.email]
              }
            }
          }
        }
      }

      /show @agent(@agentTools) with { policy: @taskPolicy }
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });
    expect(output.trim()).toBe('sent:hello');
  });

  it('denies unlisted tool:w operations under policy.authorizations', async () => {
    await expect(
      interpretWithEnv(`
        /record @contact = { facts: [email: string], data: [name: string] }
        /exe @get_contact() = { email: "mark@example.com", name: "Mark Davies" } => contact

        /exe tool:w @send_email(recipients, cc, bcc, subject) = \`sent:@subject\`
          with { controlArgs: ["recipients", "cc", "bcc"] }
        /exe tool:w @archive_email(id) = \`archived:@id\` with { controlArgs: ["id"] }

        /var tools @agentTools = {
          send_email: {
            mlld: @send_email,
            labels: ["tool:w:send_email"],
            expose: ["recipients", "cc", "bcc", "subject"],
            controlArgs: ["recipients", "cc", "bcc"]
          },
          archive_email: {
            mlld: @archive_email,
            labels: ["tool:w:archive_email"],
            expose: ["id"],
            controlArgs: ["id"]
          }
        }

        /exe @agent(tools) = box with { tools: @tools } [
          => @archive_email("msg-1")
        ]

        /var @contact = @get_contact()
        /var @taskPolicy = {
          authorizations: {
            allow: {
              send_email: {
                args: {
                  recipients: [@contact.email]
                }
              }
            }
          }
        }

        /var @result = @agent(@agentTools) with { policy: @taskPolicy }
      `)
    ).rejects.toThrow(/operation not authorized by policy\.authorizations/i);
  });

  it('fails closed when with { policy } provides true for a tool with controlArgs', async () => {
    await expect(
      interpretWithEnv(`
        /exe tool:w @send_email(recipients, cc, bcc, subject) = \`sent:@subject\`
          with { controlArgs: ["recipients", "cc", "bcc"] }

        /var tools @agentTools = {
          send_email: {
            mlld: @send_email,
            labels: ["tool:w:send_email"],
            expose: ["recipients", "cc", "bcc", "subject"],
            controlArgs: ["recipients", "cc", "bcc"]
          }
        }

        /exe @agent(tools) = box with { tools: @tools } [
          => "ready"
        ]

        /var @taskPolicy = {
          authorizations: {
            allow: {
              send_email: true
            }
          }
        }

        /var @result = @agent(@agentTools) with { policy: @taskPolicy }
      `)
    ).rejects.toThrow(/cannot use true in policy\.authorizations/i);
  });

  it('matches policy.authorizations against the collection key for direct collection dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @dispatch_create_draft(subject) = \`draft:@subject\` with { controlArgs: [] }

      /var tools @writeTools = {
        create_draft: {
          mlld: @dispatch_create_draft,
          expose: ["subject"],
          controlArgs: []
        }
      }

      /var @taskPolicy = {
        authorizations: {
          allow: {
            create_draft: true
          }
        }
      }

      /show @writeTools["create_draft"]("hello") with { policy: @taskPolicy }
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(output.trim()).toBe('draft:hello');
  });

  it('spreads a single arg object across the collection surface for direct dispatch', async () => {
    const output = await interpret(`
      /exe @send_email(recipients, subject, body) = \`sent:@subject:@body\`
        with { controlArgs: ["recipients"] }

      /var tools @writeTools = {
        send_email: {
          mlld: @send_email,
          expose: ["recipients", "subject", "body"],
          controlArgs: ["recipients"]
        }
      }

      /var @args = {
        recipients: ["ada@example.com"],
        subject: "hello",
        body: "world"
      }

      /show @writeTools["send_email"](@args)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(output.trim()).toBe('sent:hello:world');
  });

  it('rejects direct collection dispatch when a record-backed allowlist does not match', async () => {
    await expect(
      interpret(`
        /var @approvedRecipients = ["ada-recipient"]

        /record @send_email_inputs = {
          facts: [],
          data: [recipient: string, subject: string],
          allowlist: { recipient: @approvedRecipients },
          validate: "strict"
        }

        /exe @send_email(recipient, subject) = \`sent:@recipient:@subject\`

        /var tools @writeTools = {
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs
          }
        }

        /show @writeTools["send_email"]({
          recipient: "mallory-recipient",
          subject: "hello"
        })
      `, {
        fileSystem: new MemoryFileSystem(),
        pathService,
        pathContext,
        filePath: pathContext.filePath,
        format: 'markdown',
        normalizeBlankLines: true
      })
    ).rejects.toThrow(/must match its allowlist/i);
  });

  it('rejects direct collection dispatch when a record-backed blocklist matches', async () => {
    await expect(
      interpret(`
        /record @send_email_inputs = {
          facts: [],
          data: [recipient: string, subject: string],
          blocklist: { recipient: ["blocked-recipient"] },
          validate: "strict"
        }

        /exe @send_email(recipient, subject) = \`sent:@recipient:@subject\`

        /var tools @writeTools = {
          send_email: {
            mlld: @send_email,
            inputs: @send_email_inputs
          }
        }

        /show @writeTools["send_email"]({
          recipient: "blocked-recipient",
          subject: "hello"
        })
      `, {
        fileSystem: new MemoryFileSystem(),
        pathService,
        pathContext,
        filePath: pathContext.filePath,
        format: 'markdown',
        normalizeBlankLines: true
      })
    ).rejects.toThrow(/must not match its blocklist/i);
  });

  it('spreads a single named object into a single visible param for direct dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @delete_item(id) = { ok: true, id: @id } with { controlArgs: ["id"] }

      /var tools @writeTools = {
        delete_item: {
          mlld: @delete_item,
          expose: ["id"],
          controlArgs: ["id"]
        }
      }

      /show @writeTools["delete_item"]({ id: "11" })
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      ok: true,
      id: '11'
    });
  });

  it('spreads structured top-level arg objects from JS into direct collection dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @delete_item(id) = { ok: true, id: @id } with { controlArgs: ["id"] }

      /var tools @writeTools = {
        delete_item: {
          mlld: @delete_item,
          expose: ["id"],
          controlArgs: ["id"]
        }
      }

      /exe @makeArgs() = js {
        return { id: '11' };
      }

      /var @args = @makeArgs()
      /show @writeTools["delete_item"](@args)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      ok: true,
      id: '11'
    });
  });

  it('spreads nested dynamic arg objects for dynamic collection-key dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @delete_item(id) = { ok: true, id: @id } with { controlArgs: ["id"] }

      /var tools @writeTools = {
        delete_item: {
          mlld: @delete_item,
          expose: ["id"],
          controlArgs: ["id"]
        }
      }

      /exe @makeCandidate() = js {
        return {
          tool: 'delete_item',
          args: { id: '11' }
        };
      }

      /var @candidate = @makeCandidate()
      /show @writeTools[@candidate.tool](@candidate.args)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      ok: true,
      id: '11'
    });
  });

  it('preserves preview-bearing handle objects through direct collection spread dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @create_event(participants, subject) = {
        participants: @participants,
        subject: @subject
      } with { controlArgs: [] }

      /var tools @writeTools = {
        create_event: {
          mlld: @create_event,
          expose: ["participants", "subject"],
          controlArgs: []
        }
      }

      /var @args = {
        participants: [{ preview: "a***@example.com", handle: "h_abc123" }],
        subject: "hello"
      }

      /show @writeTools["create_event"](@args)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      participants: [{ preview: 'a***@example.com', handle: 'h_abc123' }],
      subject: 'hello'
    });
  });

  it('preserves preview-bearing handle objects through dynamic collection-key dispatch', async () => {
    const output = await interpret(`
      /exe tool:w @create_event(participants, subject) = {
        participants: @participants,
        subject: @subject
      } with { controlArgs: [] }

      /var tools @writeTools = {
        create_event: {
          mlld: @create_event,
          expose: ["participants", "subject"],
          controlArgs: []
        }
      }

      /var @candidate = {
        tool: "create_event",
        args: {
          participants: [{ preview: "a***@example.com", handle: "h_abc123" }],
          subject: "hello"
        }
      }

      /show @writeTools[@candidate.tool](@candidate.args)
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(JSON.parse(output.trim())).toEqual({
      participants: [{ preview: 'a***@example.com', handle: 'h_abc123' }],
      subject: 'hello'
    });
  });

  it('preserves tool collection dispatch through a local let alias', async () => {
    const env = await interpretWithEnv(`
      /exe @send_email(recipients: array, subject, body, attachments: array, cc: array, bcc: array) = {
        recipients: @recipients,
        subject: @subject,
        body: @body,
        attachments: @attachments,
        cc: @cc,
        bcc: @bcc
      } with { controlArgs: ["recipients"] }

      /var tools @writeTools = {
        send_email: {
          mlld: @send_email,
          expose: ["recipients", "subject", "body", "attachments", "cc", "bcc"],
          controlArgs: ["recipients"]
        }
      }

      /exe @runner(args) = [
        let @activeWriteToolCollection = @writeTools ?? {}
        => @activeWriteToolCollection["send_email"](@args)
      ]

      /var @args = {
        recipients: [{ demo: "x" }],
        subject: "hello",
        body: "world",
        attachments: [],
        cc: [],
        bcc: []
      }

      /var @result = @runner(@args)
    `);

    const result = await extractVariableValue(env.getVariable('result') as any, env) as any;
    expect(result.data ?? result).toEqual({
      recipients: [{ demo: 'x' }],
      subject: 'hello',
      body: 'world',
      attachments: [],
      cc: [],
      bcc: []
    });
  });

  it('preserves imported tool collections through exe params and local let aliases', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tools.mld"

        /exe @runner(tools, args) = [
          let @activeWriteToolCollection = @tools ?? {}
          => @activeWriteToolCollection["send_email"](@args)
        ]

        /var @args = {
          recipients: [{ demo: "x" }],
          subject: "hello",
          body: "world",
          attachments: [],
          cc: [],
          bcc: []
        }

        /var @result = @runner(@writeTools, @args)
      `,
      {
        '/tools.mld': `
          /exe @send_email(recipients: array, subject, body, attachments: array, cc: array, bcc: array) = {
            recipients: @recipients,
            subject: @subject,
            body: @body,
            attachments: @attachments,
            cc: @cc,
            bcc: @bcc
          } with { controlArgs: ["recipients"] }

          /var tools @writeTools = {
            send_email: {
              mlld: @send_email,
              expose: ["recipients", "subject", "body", "attachments", "cc", "bcc"],
              controlArgs: ["recipients"]
            }
          }

          /export { @writeTools }
        `
      }
    );

    const resultVar = env.getVariable('result');
    const result = await extractVariableValue(resultVar as any, env) as any;
    expect(result.data ?? result).toEqual({
      recipients: [{ demo: 'x' }],
      subject: 'hello',
      body: 'world',
      attachments: [],
      cc: [],
      bcc: []
    });
  });

  it('propagates attached session frames through imported tool entry mlld references', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @s, @myTools } from "/wrapper.mld"

        /exe llm @test(prompt, config) = [
          let @direct = @myTools.greet.mlld({})
          => @direct
        ]

        /var @result = @test("hi", {}) with {
          session: @s,
          seed: { name: "seeded" }
        }
      `,
      {
        '/schema.mld': `
          /var session @s = {
            name: string?
          }

          /export { @s }
        `,
        '/wrapper.mld': `
          /import { @s } from "/schema.mld"

          /exe @myTool(input) = [
            let @name = @s.name
            if !@name.isDefined() [
              => { status: "error", error: "uninitialized" }
            ]
            => { status: "ok", name: @name }
          ]

          /var tools @myTools = {
            greet: {
              mlld: @myTool,
              labels: ["tool:w"],
              direct: true,
              description: "test"
            }
          }

          /export { @s, @myTools }
        `
      }
    );

    const result = await extractVariableValue(env.getVariable('result') as any, env) as any;
    expect(result.data ?? result).toEqual({
      status: 'ok',
      name: 'seeded'
    });
  });

  it('invokes parameter-bound tool entry executable fields before preserved collection dispatch', async () => {
    const env = await interpretWithEnv(`
      /exe @hello() = "entry-mlld-field"
      /exe @collectionMlld() = "collection-tool-mlld"

      /exe @callDot(entry) = @entry.mlld()
      /exe @callBracket(entry) = @entry["mlld"]()

      /var tools @tools = {
        greet: {
          mlld: @hello,
          labels: ["tool:w"]
        },
        mlld: {
          mlld: @collectionMlld,
          labels: ["tool:w"]
        }
      }

      /var @dot = @callDot(@tools.greet)
      /var @bracket = @callBracket(@tools.greet)
      /var @collection = @tools.mlld()
    `);

    const dot = await extractVariableValue(env.getVariable('dot') as any, env);
    const bracket = await extractVariableValue(env.getVariable('bracket') as any, env);
    const collection = await extractVariableValue(env.getVariable('collection') as any, env);

    expect((dot as any).data ?? dot).toBe('entry-mlld-field');
    expect((bracket as any).data ?? bracket).toBe('entry-mlld-field');
    expect((collection as any).data ?? collection).toBe('collection-tool-mlld');
  });

  it('keeps positional direct collection dispatch behavior unchanged', async () => {
    const output = await interpret(`
      /exe @send_email(recipients, subject, body) = \`sent:@subject:@body\`
        with { controlArgs: ["recipients"] }

      /var tools @writeTools = {
        send_email: {
          mlld: @send_email,
          expose: ["recipients", "subject", "body"],
          controlArgs: ["recipients"]
        }
      }

      /show @writeTools["send_email"](["ada@example.com"], "hello", "world")
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(output.trim()).toBe('sent:hello:world');
  });

  it('applies policy matching after object-arg spreading for direct collection dispatch', async () => {
    const output = await interpret(`
      /record @contact = { facts: [email: string], data: [name: string] }
      /exe @get_contact() = { email: "mark@example.com", name: "Mark Davies" } => contact

      /exe tool:w @dispatch_send_email(recipients, cc, bcc, subject) = \`sent:@subject\`
        with { controlArgs: ["recipients", "cc", "bcc"] }

      /var tools @writeTools = {
        send_email: {
          mlld: @dispatch_send_email,
          labels: ["tool:w:send_email"],
          expose: ["recipients", "cc", "bcc", "subject"],
          controlArgs: ["recipients", "cc", "bcc"]
        }
      }

      /var @contact = @get_contact()
      /var @args = {
        recipients: [@contact.email],
        cc: [],
        bcc: [],
        subject: "hello"
      }
      /var @taskPolicy = {
        authorizations: {
          allow: {
            send_email: {
              args: {
                recipients: [@contact.email]
              }
            }
          }
        }
      }

      /show @writeTools["send_email"](@args) with { policy: @taskPolicy }
    `, {
      fileSystem: new MemoryFileSystem(),
      pathService,
      pathContext,
      filePath: pathContext.filePath,
      format: 'markdown',
      normalizeBlankLines: true
    });

    expect(output.trim()).toBe('sent:hello');
  });

  it('fails closed on unknown direct collection keys', async () => {
    await expect(
      interpretWithEnv(`
        /exe @create_draft(subject) = \`draft:@subject\`

        /var tools @writeTools = {
          create_draft: {
            mlld: @create_draft,
            expose: ["subject"]
          }
        }

        /show @writeTools["missing"]("hello")
      `)
    ).rejects.toThrow(/unknown tool 'missing'/i);
  });

  it('preserves direct collection dispatch behavior for imported collections', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @taskPolicy = {
          authorizations: {
            allow: {
              send_email: true
            }
          }
        }

        /var @args = {
          recipients: ["ada@example.com"],
          subject: "hello",
          body: "world"
        }

        /var @result = @writeTools["send_email"](@args) with { policy: @taskPolicy }
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @send_email(recipients, subject, body) = \`sent:@subject:@body\` with { controlArgs: [] }

          /var tools @writeTools = {
            send_email: {
              mlld: @send_email,
              expose: ["recipients", "subject", "body"],
              controlArgs: []
            }
          }

          /export { @writeTools }
        `
      }
    );

    const resultVar = env.getVariable('result');
    const resolved = await extractVariableValue(resultVar as any, env);

    expect((resolved as any)?.text ?? resolved).toBe('sent:hello:world');
  });

  it('preserves imported collection dispatch when threaded through an object field', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @config = { writeTools: @writeTools }
        /var @taskPolicy = {
          authorizations: {
            allow: {
              update_item: true
            }
          }
        }

        /var @result = @config.writeTools["update_item"]({
          id: "7",
          amount: 1200,
          subject: "Rent"
        }) with { policy: @taskPolicy }
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @update_item(id, amount, subject) = \`id=@id amount=@amount subject=@subject\`
            with { controlArgs: [] }

          /var tools @writeTools = {
            update_item: { mlld: @update_item }
          }

          /export { @writeTools }
        `
      }
    );

    const resolved = await extractVariableValue(env.getVariable('result') as any, env);
    expect((resolved as any)?.text ?? resolved).toBe('id=7 amount=1200 subject=Rent');
  });

  it('preserves imported collection dispatch after nested policy validation inside an executable body', async () => {
    const env = await interpretWithEnvAndFiles(
      `
        /import { @writeTools } from "/tool-module.mld"

        /var @config = { writeTools: @writeTools }
        /var @taskPolicy = {
          defaults: { rules: [] },
          operations: {},
          authorizations: {
            allow: {
              update_item: true
            }
          }
        }

        /exe @run() = [
          let @validated = @policy.validate({ allow: ["update_item"] }, @config.writeTools)
            with { policy: @taskPolicy }
          let @out = @config.writeTools["update_item"]({
            id: "7",
            amount: 1200,
            subject: "Rent"
          }) with { policy: @taskPolicy }
          => { validated: @validated, out: @out }
        ]

        /var @result = @run()
      `,
      {
        '/tool-module.mld': `
          /exe tool:w @update_item(id, amount, subject) = \`id=@id amount=@amount subject=@subject\`
            with { controlArgs: [] }

          /var tools @writeTools = {
            update_item: { mlld: @update_item }
          }

          /export { @writeTools, @update_item }
        `
      }
    );

    const resolved = await extractVariableValue(env.getVariable('result') as any, env) as any;
    const output = resolved?.data ?? resolved;
    expect(output.out?.text ?? output.out).toBe('id=7 amount=1200 subject=Rent');
  });

  it('supports show of imported collection dispatch after nested policy validation inside an executable body', async () => {
    await expect(
      interpretWithEnvAndFiles(
        `
          /import { @writeTools } from "/tool-module.mld"

          /var @config = { writeTools: @writeTools }
          /var @taskPolicy = {
            defaults: { rules: [] },
            operations: {},
            authorizations: {
              allow: {
                update_item: true
              }
            }
          }

          /exe @run() = [
            let @validated = @policy.validate({ allow: ["update_item"] }, @config.writeTools)
              with { policy: @taskPolicy }
            let @out = @config.writeTools["update_item"]({
              id: "7",
              amount: 1200,
              subject: "Rent"
            }) with { policy: @taskPolicy }
            => { validated: @validated, out: @out }
          ]

          /show @run()
        `,
        {
          '/tool-module.mld': `
            /exe tool:w @update_item(id, amount, subject) = \`id=@id amount=@amount subject=@subject\`
              with { controlArgs: [] }

            /var tools @writeTools = {
              update_item: { mlld: @update_item }
            }

            /export { @writeTools, @update_item }
          `
        }
      )
    ).resolves.toBeDefined();
  });

  it('creates tool collections directly from runtime MCP specs', async () => {
    const env = await interpretWithEnv(`
      /var @serverSpec = "${process.execPath} ${fakeServerPath}"
      /var tools @dynamicTools = mcp @serverSpec
    `);

    const toolsVar = env.getVariable('dynamicTools');
    expect(toolsVar?.internal?.isToolsCollection).toBe(true);

    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(Object.keys(collection)).toEqual(expect.arrayContaining(['echo', 'ping']));
    expect(getVisibleToolExecutableName(collection.echo.mlld)).toMatch(/^__mcp_dynamicTools_echo/);

    const router = new FunctionRouter({ environment: env, toolCollection: collection });
    await expect(router.executeFunction('ping', {})).resolves.toBe('pong');
  });

  it('spreads required-only named args when dispatching MCP-backed collection tools', async () => {
    const env = await interpretWithEnv(`
      /import tools { @createEvent } from mcp "${process.execPath} ${fakeServerPath}"

      /var tools @calendarTools = {
        create_event: @createEvent
      }

      /var @result = @calendarTools["create_event"]({
        title: "Lunch",
        participants: ["alice@example.com"]
      })
    `);

    const resolved = await extractVariableValue(env.getVariable('result') as any, env);
    const text = (resolved as any)?.text ?? String(resolved);
    expect(text).toContain('title="Lunch"');
    expect(text).toContain('participants=["alice@example.com"]');
    expect(text).not.toContain('title={"title"');
  });

  it('rejects dynamic MCP tool sources when the runtime spec is not a string', async () => {
    await expect(
      interpretWithEnv(`
        /var @serverSpec = { cmd: "${process.execPath} ${fakeServerPath}" }
        /var tools @dynamicTools = mcp @serverSpec
      `)
    ).rejects.toThrow(/non-empty string/);
  });

  it('keeps dynamic MCP proxy aliases isolated per tool collection variable', async () => {
    const env = await interpretWithEnv(`
      /var @serverSpec = "${process.execPath} ${fakeServerPath}"
      /var tools trusted @dynamicToolsA = mcp @serverSpec
      /var tools @dynamicToolsB = mcp @serverSpec
    `);

    const dynamicToolsA = env.getVariable('dynamicToolsA');
    const dynamicToolsB = env.getVariable('dynamicToolsB');
    const collectionA = dynamicToolsA?.internal?.toolCollection as ToolCollection;
    const collectionB = dynamicToolsB?.internal?.toolCollection as ToolCollection;

    expect(dynamicToolsA?.mx.labels).toContain('trusted');
    expect(getVisibleToolExecutableName(collectionA.echo.mlld))
      .not.toBe(getVisibleToolExecutableName(collectionB.echo.mlld));
    expect(getVisibleToolExecutableName(collectionA.echo.mlld)).toMatch(/^__mcp_dynamicToolsA_echo/);
    expect(getVisibleToolExecutableName(collectionB.echo.mlld)).toMatch(/^__mcp_dynamicToolsB_echo/);
  });
});
