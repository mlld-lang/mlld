import type { ShellSession } from '@services/fs/ShellSession';
import type { VirtualFS } from '@services/fs/VirtualFS';

export interface WorkspaceValue {
  type: 'workspace';
  fs: VirtualFS;
  descriptions: Map<string, string>;
  shellSession?: ShellSession;
}

export function isWorkspaceValue(value: unknown): value is WorkspaceValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'workspace'
  );
}
