import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from './AuditLogger';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

async function readAuditLog(
  fileSystem: MemoryFileSystem,
  projectRoot: string
): Promise<Array<Record<string, unknown>>> {
  const contents = await fileSystem.readFile(`${projectRoot}/.mlld/sec/audit.jsonl`);
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
});
