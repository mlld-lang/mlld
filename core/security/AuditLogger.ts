import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

export type AuditEvent = {
  ts?: string;
  event: string;
  var?: string;
  labels?: string[];
  resolved?: string;
};

export async function appendAuditEvent(
  fileSystem: IFileSystemService,
  projectRoot: string,
  event: AuditEvent
): Promise<void> {
  const record = {
    ts: event.ts ?? new Date().toISOString(),
    event: event.event,
    ...(event.var ? { var: event.var } : {}),
    ...(event.labels ? { labels: event.labels } : {}),
    ...(event.resolved ? { resolved: event.resolved } : {})
  };
  const logPath = path.join(projectRoot, '.mlld', 'sec', 'audit.jsonl');
  const dirPath = path.dirname(logPath);
  try {
    await fileSystem.mkdir(dirPath, { recursive: true });
    await fileSystem.appendFile(logPath, `${JSON.stringify(record)}\n`);
  } catch (error) {
    logger.warn('Audit log write failed', { error });
  }
}
