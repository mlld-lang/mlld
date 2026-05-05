import { describe, expect, it } from 'vitest';
import { getMaterializedStructuredText } from '@core/utils/materialized-text';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { CheckpointManager } from './CheckpointManager';
import './normalizers';

describe('CheckpointManager serialization', () => {
  it('does not materialize nested structured text while hashing args', () => {
    const payload = wrapStructured({ ok: true }, 'object');

    expect(getMaterializedStructuredText(payload)).toBeUndefined();

    const hash = CheckpointManager.computeArgsHash([{ classifier: payload }]);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(getMaterializedStructuredText(payload)).toBeUndefined();
  });

  it('skips enumerable getters during the generic object walk', () => {
    let getterReads = 0;
    const value: Record<string, unknown> = { stable: true };
    Object.defineProperty(value, 'expensive', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'derived';
      }
    });

    const preview = CheckpointManager.buildArgsPreview([value], 200);

    expect(preview).toContain('"stable":true');
    expect(preview).not.toContain('derived');
    expect(getterReads).toBe(0);
  });
});
