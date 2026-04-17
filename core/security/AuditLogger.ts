import { randomUUID } from 'crypto';
import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';
import { auditLogPath } from '@core/paths/state-dirs';
import {
  summarizeAuditValue,
  enforceAuditRecordCap
} from './AuditValueSummarizer';

const MAX_DETAIL_STRING_BYTES = 4096;
const TOOL_CALL_ARG_SUMMARIZE_OPTIONS = {
  maxDepth: 3,
  maxArrayLength: 20,
  maxObjectKeys: 12,
  maxStringLength: 160
} as const;

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
  const summarizedArgs =
    event.args !== undefined
      ? summarizeAuditValue(
          event.args,
          event.event === 'toolCall' ? TOOL_CALL_ARG_SUMMARIZE_OPTIONS : undefined
        )
      : undefined;
  const summarizedDetail = capDetail(event.detail);
  const record: Record<string, unknown> = {
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
    ...(summarizedDetail !== undefined ? { detail: summarizedDetail } : {}),
    ...(event.tool ? { tool: event.tool } : {}),
    ...(summarizedArgs !== undefined ? { args: summarizedArgs } : {}),
    ...(event.resultLength !== undefined ? { resultLength: event.resultLength } : {}),
    ...(event.duration !== undefined ? { duration: event.duration } : {}),
    ...(event.ok !== undefined ? { ok: event.ok } : {})
  };
  const capped = enforceAuditRecordCap(record);
  const logPath = auditLogPath(projectRoot);
  const dirPath = path.dirname(logPath);
  try {
    await fileSystem.mkdir(dirPath, { recursive: true });
    await fileSystem.appendFile(logPath, `${JSON.stringify(capped)}\n`);
  } catch (error) {
    logger.warn('Audit log write failed', { error });
  }
  return id;
}

function capDetail(detail: string | undefined): string | undefined {
  if (detail === undefined) {
    return undefined;
  }
  if (detail.length <= MAX_DETAIL_STRING_BYTES) {
    return detail;
  }
  return `${detail.slice(0, MAX_DETAIL_STRING_BYTES)}… [truncated ${detail.length - MAX_DETAIL_STRING_BYTES} chars]`;
}
