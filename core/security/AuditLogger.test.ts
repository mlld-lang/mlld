import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from './AuditLogger';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

async function readAuditLog(
  fileSystem: MemoryFileSystem,
  projectRoot: string
): Promise<Array<Record<string, unknown>>> {
  const contents = await fileSystem.readFile(`${projectRoot}/.llm/sec/audit.jsonl`);
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

describe('AuditLogger', () => {
  it('returns generated ids and writes them into every audit record', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';

    const id = await appendAuditEvent(fileSystem, projectRoot, {
      event: 'write',
      path: '/project/out.txt'
    });

    const [record] = await readAuditLog(fileSystem, projectRoot);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(record?.id).toBe(id);
    expect(record?.event).toBe('write');
  });

  it('writes toolCall records with the extended payload fields', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';

    await appendAuditEvent(fileSystem, projectRoot, {
      id: 'tool-audit-id',
      event: 'toolCall',
      tool: 'verify',
      args: { value: 'abc' },
      ok: false,
      resultLength: 12,
      duration: 34,
      labels: ['untrusted'],
      taint: ['src:mcp', 'untrusted'],
      sources: ['mcp:verify'],
      detail: 'verification failed'
    });

    const [record] = await readAuditLog(fileSystem, projectRoot);
    expect(record).toMatchObject({
      id: 'tool-audit-id',
      event: 'toolCall',
      tool: 'verify',
      args: { value: 'abc' },
      ok: false,
      resultLength: 12,
      duration: 34,
      labels: ['untrusted'],
      taint: ['src:mcp', 'untrusted'],
      sources: ['mcp:verify'],
      detail: 'verification failed'
    });
  });

  it('strips captured-env / executableDef plumbing from tool-call args', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';

    await appendAuditEvent(fileSystem, projectRoot, {
      event: 'toolCall',
      tool: 'send_email',
      args: {
        recipients: ['a@b.co'],
        body: 'short body',
        capturedModuleEnv: { mcp: { huge: new Array(1000).fill('x'.repeat(500)) } },
        executableDef: { codeTemplate: new Array(200).fill({ nodeId: 'x', type: 'ExeBlock' }) }
      },
      taint: ['untrusted']
    });

    const [record] = await readAuditLog(fileSystem, projectRoot);
    const args = record.args as Record<string, unknown>;
    expect(args.recipients).toEqual(['a@b.co']);
    expect(args.body).toBe('short body');
    expect(args.capturedModuleEnv).toBe('[omitted]');
    expect(args.executableDef).toBe('[omitted]');
    // Record stays well under the cap
    const serialized = JSON.stringify(record);
    expect(serialized.length).toBeLessThan(2048);
  });

  it('enforces the per-record byte cap when a single arg is huge', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';

    const huge = 'x'.repeat(128 * 1024);
    await appendAuditEvent(fileSystem, projectRoot, {
      event: 'toolCall',
      tool: 'paste',
      args: { body: huge }
    });

    const [record] = await readAuditLog(fileSystem, projectRoot);
    // Long strings get previewed by the summarizer first, so the record
    // stays well inside the 64 KB cap.
    expect(JSON.stringify(record).length).toBeLessThan(64 * 1024);
    expect(record.tool).toBe('paste');
    const args = record.args as Record<string, unknown>;
    const body = args.body as Record<string, unknown>;
    expect(body.len).toBe(huge.length);
  });
});
