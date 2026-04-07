import type { DocumentState } from './language-server';

export interface EffectiveDocumentSnapshot {
  text: string;
  version: number;
}

export function clearExternalDocumentOverride(state: DocumentState): void {
  state.externalContent = undefined;
  state.externalContentVersion = undefined;
}

export function applyExternalFileRewrite(
  state: DocumentState,
  openDocumentVersion: number,
  freshText: string,
  now = Date.now()
): number {
  const nextVersion = Math.max(
    openDocumentVersion,
    state.externalContentVersion ?? state.version ?? 0
  ) + 1;

  state.externalContent = freshText;
  state.externalContentVersion = nextVersion;
  state.content = freshText;
  state.currentEditLine = undefined;
  state.lastEditTime = now;

  return nextVersion;
}

export function getEffectiveDocumentSnapshot(
  documentVersion: number,
  documentText: string,
  state: Pick<DocumentState, 'externalContent' | 'externalContentVersion'>
): EffectiveDocumentSnapshot {
  if (state.externalContent !== undefined) {
    return {
      text: state.externalContent,
      version: state.externalContentVersion ?? documentVersion
    };
  }

  return {
    text: documentText,
    version: documentVersion
  };
}
