import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessFields } from './field-access';

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

async function accessValue(
  value: unknown,
  fields: Array<{ type: 'field'; value: string }>,
  env: Environment
): Promise<unknown> {
  const result = await accessFields(value, fields, { env });
  if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
    return (result as { value: unknown }).value;
  }
  return result;
}

describe('tool entry mx accessors', () => {
  it('exposes collection and entry metadata via .mx', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada@example.com"]

      /record @send_email_inputs = {
        facts: [recipient: string, cc: string?],
        data: [subject: string, body: string?],
        exact: [subject],
        update: [subject],
        allowlist: { recipient: @approvedRecipients },
        blocklist: { subject: ["blocked"] },
        optional_benign: [cc],
        correlate: true,
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, cc, subject, body) = js {
        return { recipient, cc, subject, body };
      }

      /exe tool:w @createDraft(subject, body) = js {
        return { subject, body };
      }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w", "update:w", "comm:w"],
          description: "Send mail",
          instructions: "Prefer drafts first.",
          can_authorize: ["role:planner", "role:operator"]
        },
        createDraft: {
          mlld: @createDraft,
          labels: ["tool:w"]
        }
      }
    `);

    const writeTools = env.getVariable('writeTools') as any;

    const toolNames = await accessValue(writeTools, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'tools' } as const
    ], env);

    const inputSchema = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'inputSchema' } as const
    ], env);

    const factArgs = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'factArgs' } as const
    ], env);

    const optionalArgs = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'optionalArgs' } as const
    ], env);

    const labels = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'labels' } as const
    ], env);

    const canAuthorize = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'canAuthorize' } as const
    ], env);

    const allowlist = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'allowlist' } as const
    ], env);

    const blocklist = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'blocklist' } as const
    ], env);

    const correlate = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'correlate' } as const
    ], env);

    expect(toolNames).toEqual(['sendEmail', 'createDraft']);
    expect(inputSchema).toMatchObject({
      recordName: 'send_email_inputs',
      factFields: ['recipient', 'cc'],
      dataFields: ['subject', 'body'],
      optionalParams: ['cc', 'body'],
      exactFields: ['subject'],
      updateFields: ['subject'],
      optionalBenignFields: ['cc'],
      correlate: true
    });
    expect(factArgs).toEqual(['recipient', 'cc']);
    expect(optionalArgs).toEqual(['cc', 'body']);
    expect(labels).toEqual(['tool:w', 'execute:w', 'update:w', 'comm:w']);
    expect(canAuthorize).toEqual(['role:planner', 'role:operator']);
    expect(allowlist).toEqual({
      recipient: {
        kind: 'reference',
        name: 'approvedRecipients'
      }
    });
    expect(blocklist).toEqual({
      subject: {
        kind: 'array',
        values: ['blocked']
      }
    });
    expect(correlate).toBe(true);
  });

  it('returns empty reflection arrays for tools without inputs', async () => {
    const env = await interpretWithEnv(`
      /exe tool:w @createDraft(subject, body) = js {
        return { subject, body };
      }

      /var tools @writeTools = {
        createDraft: {
          mlld: @createDraft,
          labels: ["tool:w"]
        }
      }
    `);

    const writeTools = env.getVariable('writeTools') as any;

    const inputSchema = await accessValue(writeTools, [
      { type: 'field', value: 'createDraft' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'inputSchema' } as const
    ], env);

    const factArgs = await accessValue(writeTools, [
      { type: 'field', value: 'createDraft' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'factArgs' } as const
    ], env);

    expect(inputSchema).toBeUndefined();
    expect(factArgs).toEqual([]);
  });

  it('returns frozen tool mx projections', async () => {
    const env = await interpretWithEnv(`
      /var @approvedRecipients = ["ada@example.com"]

      /record @send_email_inputs = {
        facts: [recipient: string],
        data: [subject: string],
        allowlist: { recipient: @approvedRecipients },
        validate: "strict"
      }

      /exe tool:w @sendEmail(recipient, subject) = js {
        return { recipient, subject };
      }

      /var tools @writeTools = {
        sendEmail: {
          mlld: @sendEmail,
          inputs: @send_email_inputs,
          labels: ["execute:w"]
        }
      }
    `);

    const writeTools = env.getVariable('writeTools') as any;

    const factArgs = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'factArgs' } as const
    ], env);

    const inputSchema = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'inputSchema' } as const
    ], env);

    const allowlist = await accessValue(writeTools, [
      { type: 'field', value: 'sendEmail' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'allowlist' } as const
    ], env);

    expect(Object.isFrozen(factArgs)).toBe(true);
    expect(Object.isFrozen(inputSchema)).toBe(true);
    expect(Object.isFrozen(allowlist)).toBe(true);
    expect(() => {
      (factArgs as string[]).push('cc');
    }).toThrow();
    expect((inputSchema as { factFields: string[] }).factFields).toEqual(['recipient']);
    expect((allowlist as { recipient: { kind: string; name: string } }).recipient).toEqual({
      kind: 'reference',
      name: 'approvedRecipients'
    });
  });
});
