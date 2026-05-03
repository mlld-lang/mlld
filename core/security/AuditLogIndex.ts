import path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { makeSecurityDescriptor } from '@core/types/security';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import { auditLogPath, auditWriteIndexPath } from '@core/paths/state-dirs';

export type AuditFileRecord = {
  taint: string[];
  writers: string[];
};

type AuditIndexState = {
  path?: string;
  size?: number;
  records: Map<string, AuditFileRecord>;
};

const auditIndex = new Map<string, AuditIndexState>();
const DEFAULT_MAX_FULL_AUDIT_INDEX_BYTES = 16 * 1024 * 1024;

function getAuditLogPath(projectRoot: string): string {
  return auditLogPath(projectRoot);
}

function getAuditWriteIndexPath(projectRoot: string): string {
  return auditWriteIndexPath(projectRoot);
}

function maxFullAuditIndexBytes(): number {
  const raw = process.env.MLLD_AUDIT_INDEX_MAX_BYTES;
  if (!raw) {
    return DEFAULT_MAX_FULL_AUDIT_INDEX_BYTES;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MAX_FULL_AUDIT_INDEX_BYTES;
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
  const writeIndexPath = getAuditWriteIndexPath(projectRoot);
  const hasWriteIndex = await fileSystem.exists(writeIndexPath).catch(() => false);
  const logPath = getAuditLogPath(projectRoot);
  const sourcePath = hasWriteIndex ? writeIndexPath : logPath;
  const exists = hasWriteIndex || await fileSystem.exists(logPath).catch(() => false);
  if (!exists) {
    state.records.clear();
    state.path = sourcePath;
    state.size = 0;
    return;
  }

  const stats = await fileSystem.stat(sourcePath).catch(() => null);
  const size = stats?.size;
  if (size !== undefined && state.path === sourcePath && state.size === size) {
    return;
  }

  if (!hasWriteIndex && size !== undefined && size > maxFullAuditIndexBytes()) {
    state.records.clear();
    state.path = sourcePath;
    state.size = size;
    return;
  }

  const content = await fileSystem.readFile(sourcePath).catch(() => '');
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
      const normalizedPath = normalizePath(recordPath);
      const existing = records.get(normalizedPath);
      if (!existing) {
        records.set(normalizedPath, {
          taint,
          writers: writer ? [writer] : []
        });
        continue;
      }

      const taintSet = new Set<string>(existing.taint);
      for (const label of taint) {
        taintSet.add(label);
      }

      const writers = [...existing.writers];
      if (writer && !writers.includes(writer)) {
        writers.push(writer);
      }

      records.set(normalizedPath, {
        taint: Array.from(taintSet),
        writers
      });
    } catch {
      continue;
    }
  }

  state.records = records;
  state.path = sourcePath;
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
    sources: record.writers
  });
}
