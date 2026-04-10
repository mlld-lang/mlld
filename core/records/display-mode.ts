import type {
  RecordDisplayEntry,
  RecordDisplayMode,
  RecordFieldProjectionMetadata
} from '@core/types/record';

export interface DisplaySelection {
  strictMode: boolean;
  modeName?: string;
}

const ROLE_DISPLAY_MODE_PREFIX = 'role:';
const BARE_DISPLAY_MODE_PATTERN =
  /^[A-Za-z_](?:[A-Za-z0-9_]|-[A-Za-z0-9_])*(?::[A-Za-z_](?:[A-Za-z0-9_]|-[A-Za-z0-9_])*)?$/;

export function normalizeDisplayModeName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isStrictDisplayModeName(value: unknown): boolean {
  const normalized = normalizeDisplayModeName(value);
  return normalized?.toLowerCase() === 'strict';
}

export function isRoleDisplayModeName(value: unknown): value is string {
  const normalized = normalizeDisplayModeName(value);
  return typeof normalized === 'string'
    && normalized.startsWith(ROLE_DISPLAY_MODE_PREFIX)
    && normalized.length > ROLE_DISPLAY_MODE_PREFIX.length;
}

export function findRoleDisplayMode(labels: readonly string[] | undefined): string | undefined {
  if (!Array.isArray(labels)) {
    return undefined;
  }

  for (const label of labels) {
    const normalized = normalizeDisplayModeName(label);
    if (isRoleDisplayModeName(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

export function normalizeDisplaySelection(value: unknown): DisplaySelection {
  if (isStrictDisplayModeName(value)) {
    return { strictMode: true };
  }

  const modeName = normalizeDisplayModeName(value);
  return modeName
    ? { strictMode: false, modeName }
    : { strictMode: false };
}

export function resolveDisplaySelection(options: {
  scopedDisplay?: unknown;
  exeLabels?: readonly string[] | undefined;
}): DisplaySelection {
  const scopedSelection = normalizeDisplaySelection(options.scopedDisplay);
  if (scopedSelection.strictMode || scopedSelection.modeName) {
    return scopedSelection;
  }

  const roleMode = findRoleDisplayMode(options.exeLabels);
  return roleMode
    ? { strictMode: false, modeName: roleMode }
    : { strictMode: false };
}

export function formatDisplayModeName(modeName: string): string {
  const normalized = normalizeDisplayModeName(modeName) ?? modeName;
  return BARE_DISPLAY_MODE_PATTERN.test(normalized)
    ? normalized
    : JSON.stringify(normalized);
}

function findDisplayEntry(
  entries: readonly RecordDisplayEntry[],
  fieldName: string
): RecordDisplayEntry | undefined {
  return entries.find(entry => entry.field === fieldName);
}

function displayEntryToMode(entry: RecordDisplayEntry): RecordDisplayMode {
  return entry.kind;
}

export function resolveRecordFieldDisplayMode(
  fieldProjection: Pick<
    RecordFieldProjectionMetadata,
    'classification' | 'display' | 'fieldName' | 'recordName'
  >,
  selection: DisplaySelection
): { omitted: boolean; mode: RecordDisplayMode } {
  if (selection.strictMode) {
    return fieldProjection.classification === 'fact'
      ? { omitted: false, mode: 'handle' }
      : { omitted: true, mode: 'bare' };
  }

  const display = fieldProjection.display;
  if (display.kind === 'open') {
    return fieldProjection.classification === 'fact'
      ? { omitted: false, mode: 'ref' }
      : { omitted: false, mode: 'bare' };
  }

  if (display.kind === 'legacy') {
    const explicit = findDisplayEntry(display.entries, fieldProjection.fieldName);
    return explicit
      ? { omitted: false, mode: displayEntryToMode(explicit) }
      : { omitted: true, mode: 'bare' };
  }

  const selectedMode = selection.modeName ?? (Object.prototype.hasOwnProperty.call(display.modes, 'default')
    ? 'default'
    : undefined);
  if (!selectedMode) {
    throw new Error(
      `Record '@${fieldProjection.recordName}' requires an explicit display mode before '${fieldProjection.fieldName}' can be projected`
    );
  }

  const entries = display.modes[selectedMode];
  if (!entries) {
    throw new Error(
      `Record '@${fieldProjection.recordName}' does not declare display mode '${selectedMode}'`
    );
  }

  const explicit = findDisplayEntry(entries, fieldProjection.fieldName);
  if (!explicit) {
    return { omitted: true, mode: 'bare' };
  }

  return {
    omitted: false,
    mode: displayEntryToMode(explicit)
  };
}
