import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

export type AuditEvent = {
  ts?: string;
  event: string;
  var?: string;
  add?: string[];
  remove?: string[];
  by?: string;
  hash?: string;
  result?: boolean;
  caller?: string;
  path?: string;
  taint?: string[];
  writer?: string;
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
    ...(event.add !== undefined ? { add: event.add } : {}),
    ...(event.remove !== undefined ? { remove: event.remove } : {}),
    ...(event.by ? { by: event.by } : {}),
    ...(event.hash ? { hash: event.hash } : {}),
    ...(event.result !== undefined ? { result: event.result } : {}),
    ...(event.caller ? { caller: event.caller } : {}),
    ...(event.path ? { path: event.path } : {}),
    ...(event.taint !== undefined ? { taint: event.taint } : {}),
    ...(event.writer ? { writer: event.writer } : {}),
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
