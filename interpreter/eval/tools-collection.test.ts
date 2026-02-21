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
});
