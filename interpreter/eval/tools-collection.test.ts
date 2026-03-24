import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';
import type { ToolCollection } from '@core/types/tools';
import { FunctionRouter } from '@cli/mcp/FunctionRouter';
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

describe('tool collections', () => {
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
    expect(collection.read.mlld).toBe('readData');
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

  it('rejects invalid expose values', async () => {
    await expect(
      interpretWithEnv(`
        /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
        /var tools @badTools = {
          createIssue: { mlld: @createIssue, expose: ["title", "missing"] }
        }
      `)
    ).rejects.toThrow(/expose values/i);
  });

  it('rejects expose values that overlap bind', async () => {
    await expect(
      interpretWithEnv(`
        /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
        /var tools @badTools = {
          createIssue: { mlld: @createIssue, bind: { owner: "mlld" }, expose: ["owner", "title"] }
        }
      `)
    ).rejects.toThrow(/expose values cannot include bound/i);
  });

  it('rejects expose values that skip required parameters', async () => {
    await expect(
      interpretWithEnv(`
        /exe @createIssue(owner: string, repo: string, title: string) = js { return title; }
        /var tools @badTools = {
          createIssue: { mlld: @createIssue, expose: ["title"] }
        }
      `)
    ).rejects.toThrow(/cover required parameters/i);
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

  it('rejects optional values that are not exposed', async () => {
    await expect(
      interpretWithEnv(`
        /exe @verify(vars: string) = js { return vars; }
        /var tools @badTools = {
          verify: { mlld: @verify, optional: ["vars"] }
        }
      `)
    ).rejects.toThrow(/optional values require expose/i);
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
    expect(collection.guardedFetch.mlld).toBe('guardedFetch');
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

  it('allows authorized tool:w operations to override unlocked no-send-to-unknown policy denials', async () => {
    const result = await interpret(`
      /exe tool:w @send_email(recipients, cc, bcc, subject) = \`sent:@subject\`

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

      /var @taskPolicy = {
        defaults: { rules: ["no-send-to-unknown"] },
        operations: {
          "exfil:send": ["tool:w:send_email"]
        },
        authorizations: {
          allow: {
            send_email: {
              args: {
                recipients: ["mark@example.com"],
                cc: [],
                bcc: []
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

    expect(result.trim()).toBe('sent:hello');
  });

  it('denies unlisted tool:w operations under policy.authorizations', async () => {
    await expect(
      interpretWithEnv(`
        /exe tool:w @send_email(recipients, cc, bcc, subject) = \`sent:@subject\`
        /exe tool:w @archive_email(id) = \`archived:@id\`

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

        /var @taskPolicy = {
          authorizations: {
            allow: {
              send_email: {
                args: {
                  recipients: ["mark@example.com"],
                  cc: [],
                  bcc: []
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

  it('creates tool collections directly from runtime MCP specs', async () => {
    const env = await interpretWithEnv(`
      /var @serverSpec = "${process.execPath} ${fakeServerPath}"
      /var tools @dynamicTools = mcp @serverSpec
    `);

    const toolsVar = env.getVariable('dynamicTools');
    expect(toolsVar?.internal?.isToolsCollection).toBe(true);

    const collection = toolsVar?.internal?.toolCollection as ToolCollection;
    expect(Object.keys(collection)).toEqual(expect.arrayContaining(['echo', 'ping']));
    expect(collection.echo.mlld).toMatch(/^__mcp_dynamicTools_echo/);

    const router = new FunctionRouter({ environment: env, toolCollection: collection });
    await expect(router.executeFunction('ping', {})).resolves.toBe('pong');
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
    expect(collectionA.echo.mlld).not.toBe(collectionB.echo.mlld);
    expect(collectionA.echo.mlld).toMatch(/^__mcp_dynamicToolsA_echo/);
    expect(collectionB.echo.mlld).toMatch(/^__mcp_dynamicToolsB_echo/);
  });
});
