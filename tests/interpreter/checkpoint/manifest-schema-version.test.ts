import { describe, expect, it } from 'vitest';

interface CheckpointManifest {
  version: number;
  createdAt: string;
  [key: string]: unknown;
}

interface ManifestParseResult {
  ok: boolean;
  manifest?: CheckpointManifest;
  error?: string;
  coldStart?: boolean;
}

const CURRENT_MANIFEST_VERSION = 1;

/**
 * Phase 0.5 scaffold for future CheckpointManager manifest compatibility.
 */
function parseManifestWithCompatibility(raw: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid-shape' };
  }

  const manifest = parsed as CheckpointManifest;
  if (typeof manifest.version !== 'number') {
    return { ok: false, error: 'missing-version' };
  }

  if (manifest.version > CURRENT_MANIFEST_VERSION) {
    return { ok: true, manifest, coldStart: true };
  }

  return { ok: true, manifest, coldStart: false };
}

describe('checkpoint manifest schema/version scaffold', () => {
  it('accepts current manifest versions and preserves unknown fields', () => {
    const raw = JSON.stringify({
      version: 1,
      createdAt: '2026-02-19T00:00:00.000Z',
      checksum: 'abc123',
      futureHint: { mode: 'preview' }
    });
    const result = parseManifestWithCompatibility(raw);

    expect(result.ok).toBe(true);
    expect(result.coldStart).toBe(false);
    expect(result.manifest?.futureHint).toEqual({ mode: 'preview' });
  });

  it('treats unknown future versions as cold-start compatible', () => {
    const raw = JSON.stringify({
      version: 99,
      createdAt: '2026-02-19T00:00:00.000Z'
    });
    const result = parseManifestWithCompatibility(raw);

    expect(result.ok).toBe(true);
    expect(result.coldStart).toBe(true);
    expect(result.manifest?.version).toBe(99);
  });

  it('returns a typed parse error for malformed json', () => {
    const result = parseManifestWithCompatibility('{bad json}');
    expect(result).toEqual({ ok: false, error: 'invalid-json' });
  });
});
