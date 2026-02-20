import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import { appendAuditEvent } from '@core/security/AuditLogger';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';

export async function logFileWriteEvent(
  env: Environment,
  targetPath: string,
  descriptor?: SecurityDescriptor
): Promise<void> {
  const taint = descriptorToInputTaint(descriptor);
  const writer = descriptor?.sources?.find(source => Boolean(source));
  await appendAuditEvent(env.getFileSystemService(), env.getProjectRoot(), {
    event: 'write',
    path: targetPath,
    taint,
    writer
  });
}
