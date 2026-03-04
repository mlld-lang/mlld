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
});
