import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import { appendAuditEvent } from '@core/security/AuditLogger';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';

interface FileWriteAuditOptions {
  changeType?: 'created' | 'modified' | 'deleted';
  writer?: string;
}

interface ToolCallAuditOptions {
  id?: string;
  tool: string;
  args?: Record<string, unknown>;
  ok: boolean;
  error?: string;
  resultLength?: number;
  duration?: number;
  labels?: readonly string[];
  taint?: readonly string[];
  sources?: readonly string[];
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

export async function logToolCallEvent(
  env: Environment,
  options: ToolCallAuditOptions
): Promise<string> {
  return appendAuditEvent(env.getFileSystemService(), env.getProjectRoot(), {
    id: options.id,
    event: 'toolCall',
    tool: options.tool,
    args: options.args,
    ok: options.ok,
    ...(options.error ? { detail: options.error } : {}),
    ...(options.resultLength !== undefined ? { resultLength: options.resultLength } : {}),
    ...(options.duration !== undefined ? { duration: options.duration } : {}),
    ...(options.labels ? { labels: [...options.labels] } : {}),
    ...(options.taint ? { taint: [...options.taint] } : {}),
    ...(options.sources ? { sources: [...options.sources] } : {})
  });
}
