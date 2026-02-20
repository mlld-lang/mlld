import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { makeSecurityDescriptor } from '@core/types/security';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';

export type AuditFileRecord = {
  taint: string[];
  writer?: string;
};

type AuditIndexState = {
  size?: number;
  records: Map<string, AuditFileRecord>;
};

const auditIndex = new Map<string, AuditIndexState>();

function getAuditLogPath(projectRoot: string): string {
  return path.join(projectRoot, '.mlld', 'sec', 'audit.jsonl');
}

function normalizePath(value: string): string {
  return path.resolve(value);
}

function extractLabels(taint: readonly string[]): DataLabel[] {
  return taint.filter(label => !label.startsWith('src:') && !label.startsWith('dir:')) as DataLabel[];
}

async function loadAuditIndex(
  fileSystem: IFileSystemService,
  projectRoot: string,
  state: AuditIndexState
): Promise<void> {
  const logPath = getAuditLogPath(projectRoot);
  const exists = await fileSystem.exists(logPath).catch(() => false);
  if (!exists) {
    state.records.clear();
    state.size = 0;
    return;
  }

  const stats = await fileSystem.stat(logPath).catch(() => null);
  const size = stats?.size;
  if (size !== undefined && state.size === size) {
    return;
  }

  const content = await fileSystem.readFile(logPath).catch(() => '');
  const records = new Map<string, AuditFileRecord>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const record = JSON.parse(trimmed) as Record<string, unknown>;
      if (record.event !== 'write') {
        continue;
      }
      const recordPath = typeof record.path === 'string' ? record.path : null;
      if (!recordPath) {
        continue;
      }
      const taint = Array.isArray(record.taint) ? record.taint.map(String) : [];
      const writer = typeof record.writer === 'string' ? record.writer : undefined;
      records.set(normalizePath(recordPath), { taint, writer });
    } catch {
      continue;
    }
  }

  state.records = records;
  state.size = size;
}

export async function getAuditFileDescriptor(
  fileSystem: IFileSystemService,
  projectRoot: string,
  filePath: string
): Promise<SecurityDescriptor | undefined> {
  let state = auditIndex.get(projectRoot);
  if (!state) {
    state = { records: new Map<string, AuditFileRecord>() };
    auditIndex.set(projectRoot, state);
  }

  await loadAuditIndex(fileSystem, projectRoot, state);
  const record = state.records.get(normalizePath(filePath));
  if (!record) {
    return undefined;
  }

  const labels = extractLabels(record.taint);
  return makeSecurityDescriptor({
    labels,
    taint: record.taint,
    sources: record.writer ? [record.writer] : []
  });
}
