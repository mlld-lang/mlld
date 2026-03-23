import { randomUUID } from 'crypto';
import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

export type AuditEvent = {
  id?: string;
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
  changeType?: 'created' | 'modified' | 'deleted';
  taint?: string[];
  writer?: string;
  labels?: string[];
  sources?: string[];
  resolved?: string;
  detail?: string;
  tool?: string;
  args?: Record<string, unknown>;
  resultLength?: number;
  duration?: number;
  ok?: boolean;
};

export async function appendAuditEvent(
  fileSystem: IFileSystemService,
  projectRoot: string,
  event: AuditEvent
): Promise<string> {
  const id = event.id ?? randomUUID();
  const record = {
    id,
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
    ...(event.changeType ? { changeType: event.changeType } : {}),
    ...(event.taint !== undefined ? { taint: event.taint } : {}),
    ...(event.writer ? { writer: event.writer } : {}),
    ...(event.labels ? { labels: event.labels } : {}),
    ...(event.sources !== undefined ? { sources: event.sources } : {}),
    ...(event.resolved ? { resolved: event.resolved } : {}),
    ...(event.detail ? { detail: event.detail } : {}),
    ...(event.tool ? { tool: event.tool } : {}),
    ...(event.args !== undefined ? { args: event.args } : {}),
    ...(event.resultLength !== undefined ? { resultLength: event.resultLength } : {}),
    ...(event.duration !== undefined ? { duration: event.duration } : {}),
    ...(event.ok !== undefined ? { ok: event.ok } : {})
  };
  const logPath = path.join(projectRoot, '.mlld', 'sec', 'audit.jsonl');
  const dirPath = path.dirname(logPath);
  try {
    await fileSystem.mkdir(dirPath, { recursive: true });
    await fileSystem.appendFile(logPath, `${JSON.stringify(record)}\n`);
  } catch (error) {
    logger.warn('Audit log write failed', { error });
  }
  return id;
}
