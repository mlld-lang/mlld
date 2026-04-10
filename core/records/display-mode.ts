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
