import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import { appendAuditEvent } from '@core/security/AuditLogger';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';

interface FileWriteAuditOptions {
  changeType?: 'created' | 'modified' | 'deleted';
  writer?: string;
}

export async function logFileWriteEvent(
  env: Environment,
  targetPath: string,
  descriptor?: SecurityDescriptor,
  options?: FileWriteAuditOptions
): Promise<void> {
  const taint = descriptorToInputTaint(descriptor);
  const writer =
    options?.writer ??
    descriptor?.sources?.find(source => Boolean(source));
  await appendAuditEvent(env.getFileSystemService(), env.getProjectRoot(), {
    event: 'write',
    path: targetPath,
    changeType: options?.changeType,
    taint,
    writer
  });
}
