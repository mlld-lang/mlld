import type { ShellSession } from '@services/fs/ShellSession';
import type { VirtualFS, VirtualFSPatch } from '@services/fs/VirtualFS';

export interface WorkspaceMcpBridgeHandle {
  readonly mcpConfigPath: string;
  readonly socketPath: string;
  cleanup(): Promise<void>;
}

export interface WorkspaceValue {
  type: 'workspace';
  fs: VirtualFS;
  descriptions: Map<string, string>;
  shellSession?: ShellSession;
}

export interface WorkspaceCheckpointSnapshot {
  vfsPatch: VirtualFSPatch;
  descriptions: Record<string, string>;
}

export function isWorkspaceValue(value: unknown): value is WorkspaceValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'workspace'
  );
}

export function isWorkspaceCheckpointSnapshot(value: unknown): value is WorkspaceCheckpointSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const patch = record.vfsPatch as { version?: unknown; entries?: unknown } | undefined;
  const descriptions = record.descriptions;

  return (
    !!patch &&
    patch.version === 1 &&
    Array.isArray(patch.entries) &&
    !!descriptions &&
    typeof descriptions === 'object' &&
    !Array.isArray(descriptions)
  );
}
