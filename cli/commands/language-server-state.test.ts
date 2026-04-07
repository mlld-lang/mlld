import { describe, expect, it } from 'vitest';
import type { DocumentState } from './language-server';
import {
  applyExternalFileRewrite,
  clearExternalDocumentOverride,
  getEffectiveDocumentSnapshot
} from './language-server-state';

function createState(overrides: Partial<DocumentState> = {}): DocumentState {
  return {
    uri: 'file:///tmp/test.mld',
    version: 1,
    content: 'show "before"\n',
    lastEditTime: 10,
    ...overrides
  };
}

describe('language server external rewrite state', () => {
  it('prefers watched-file content until the editor sends fresh document content', () => {
    const state = createState();

    const refreshedVersion = applyExternalFileRewrite(
      state,
      1,
      'show "after"\n',
      42
    );

    expect(refreshedVersion).toBe(2);
    expect(state.externalContent).toBe('show "after"\n');
    expect(state.externalContentVersion).toBe(2);
    expect(state.currentEditLine).toBeUndefined();
    expect(state.lastEditTime).toBe(42);

    const snapshot = getEffectiveDocumentSnapshot(1, 'show "before"\n', state);
    expect(snapshot).toEqual({
      text: 'show "after"\n',
      version: 2
    });

    clearExternalDocumentOverride(state);
    const editorSnapshot = getEffectiveDocumentSnapshot(3, 'show "editor"\n', state);
    expect(editorSnapshot).toEqual({
      text: 'show "editor"\n',
      version: 3
    });
  });

  it('keeps incrementing synthetic versions across multiple external rewrites', () => {
    const state = createState({ version: 4 });

    const firstVersion = applyExternalFileRewrite(state, 4, 'show "rewrite 1"\n', 100);
    const secondVersion = applyExternalFileRewrite(state, 4, 'show "rewrite 2"\n', 200);

    expect(firstVersion).toBe(5);
    expect(secondVersion).toBe(6);
    expect(getEffectiveDocumentSnapshot(4, 'show "stale"\n', state)).toEqual({
      text: 'show "rewrite 2"\n',
      version: 6
    });
  });
});
