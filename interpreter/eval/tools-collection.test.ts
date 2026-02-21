import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { Environment } from '@interpreter/env/Environment';
import type { ToolCollection } from '@core/types/tools';

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

      /exe @agent(tools, task) = env with { tools: @tools } [
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

        /exe @agent(tools, id) = env with { tools: @tools } [
          => @deleteDoc(@id)
        ]

        /var @result = @agent(@agentTools, "doc-1")
      `)
    ).rejects.toThrow(/blocked/i);
  });
});
