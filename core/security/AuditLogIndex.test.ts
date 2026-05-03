import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from './AuditLogger';
import { getAuditFileDescriptor } from './AuditLogIndex';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('AuditLogIndex', () => {
  it('reconstructs taint and writer chain for repeated writes to the same path', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';
    const targetPath = '/project/task.md';

    await appendAuditEvent(fileSystem, projectRoot, {
      event: 'write',
      path: targetPath,
      changeType: 'created',
      taint: ['src:file'],
      writer: 'directive:file'
    });
    await appendAuditEvent(fileSystem, projectRoot, {
      event: 'write',
      path: targetPath,
      changeType: 'modified',
      taint: ['src:file', 'trusted'],
      writer: 'command:echo'
    });
    await appendAuditEvent(fileSystem, projectRoot, {
      event: 'write',
      path: targetPath,
      changeType: 'modified',
      taint: ['trusted'],
      writer: 'command:echo'
    });

    const descriptor = await getAuditFileDescriptor(fileSystem, projectRoot, targetPath);
    expect(descriptor?.taint).toEqual(expect.arrayContaining(['src:file', 'trusted']));
    expect(descriptor?.sources).toEqual(['directive:file', 'command:echo']);
  });

  it('does not bulk-read oversized historical audit logs without a write index', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';
    const targetPath = '/project/task.md';
    const oldMax = process.env.MLLD_AUDIT_INDEX_MAX_BYTES;
    process.env.MLLD_AUDIT_INDEX_MAX_BYTES = '100';

    try {
      await fileSystem.writeFile(
        `${projectRoot}/.llm/sec/audit.jsonl`,
        JSON.stringify({ event: 'toolCall', tool: 'large', args: { body: 'x'.repeat(200) } }) +
          '\n' +
          JSON.stringify({
            event: 'write',
            path: targetPath,
            taint: ['trusted'],
            writer: 'directive:file'
          }) +
          '\n'
      );

      const descriptor = await getAuditFileDescriptor(fileSystem, projectRoot, targetPath);
      expect(descriptor).toBeUndefined();
    } finally {
      if (oldMax === undefined) {
        delete process.env.MLLD_AUDIT_INDEX_MAX_BYTES;
      } else {
        process.env.MLLD_AUDIT_INDEX_MAX_BYTES = oldMax;
      }
    }
  });

  it('uses the compact write index even when the full audit log is oversized', async () => {
    const fileSystem = new MemoryFileSystem();
    const projectRoot = '/project';
    const targetPath = '/project/task.md';
    const oldMax = process.env.MLLD_AUDIT_INDEX_MAX_BYTES;
    process.env.MLLD_AUDIT_INDEX_MAX_BYTES = '100';

    try {
      await fileSystem.writeFile(
        `${projectRoot}/.llm/sec/audit.jsonl`,
        JSON.stringify({ event: 'toolCall', tool: 'large', args: { body: 'x'.repeat(200) } }) +
          '\n'
      );
      await fileSystem.writeFile(
        `${projectRoot}/.llm/sec/audit-writes.jsonl`,
        JSON.stringify({
          event: 'write',
          path: targetPath,
          taint: ['trusted'],
          writer: 'directive:file'
        }) +
          '\n'
      );

      const descriptor = await getAuditFileDescriptor(fileSystem, projectRoot, targetPath);
      expect(descriptor?.taint).toEqual(expect.arrayContaining(['trusted']));
      expect(descriptor?.sources).toEqual(['directive:file']);
    } finally {
      if (oldMax === undefined) {
        delete process.env.MLLD_AUDIT_INDEX_MAX_BYTES;
      } else {
        process.env.MLLD_AUDIT_INDEX_MAX_BYTES = oldMax;
      }
    }
  });
});
