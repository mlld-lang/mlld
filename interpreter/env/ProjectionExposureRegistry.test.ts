import { describe, expect, it } from 'vitest';
import { ProjectionExposureRegistry } from './ProjectionExposureRegistry';

describe('ProjectionExposureRegistry', () => {
  it('records and returns session-scoped preview and literal exposures', () => {
    const registry = new ProjectionExposureRegistry();
    registry.record({
      sessionId: 'session-a',
      value: 'ada@example.com',
      kind: 'mask',
      handle: 'h_abc123',
      field: 'email',
      record: 'contact',
      emittedPreview: 'a***@example.com',
      issuedAt: 1
    });
    registry.record({
      sessionId: 'session-a',
      value: 'Ada Lovelace',
      kind: 'bare',
      field: 'name',
      record: 'contact',
      emittedLiteral: 'Ada Lovelace',
      issuedAt: 2
    });

    expect(registry.getEntries('session-a')).toEqual([
      {
        sessionId: 'session-a',
        value: 'ada@example.com',
        kind: 'mask',
        handle: 'h_abc123',
        field: 'email',
        record: 'contact',
        emittedPreview: 'a***@example.com',
        issuedAt: 1
      },
      {
        sessionId: 'session-a',
        value: 'Ada Lovelace',
        kind: 'bare',
        field: 'name',
        record: 'contact',
        emittedLiteral: 'Ada Lovelace',
        issuedAt: 2
      }
    ]);

    expect(registry.matchPreview('session-a', 'a***@example.com')).toEqual({
      status: 'matched',
      matches: [
        {
          sessionId: 'session-a',
          value: 'ada@example.com',
          kind: 'mask',
          handle: 'h_abc123',
          field: 'email',
          record: 'contact',
          emittedPreview: 'a***@example.com',
          issuedAt: 1
        }
      ]
    });

    expect(registry.matchLiteral('session-a', 'Ada Lovelace')).toEqual({
      status: 'matched',
      matches: [
        {
          sessionId: 'session-a',
          value: 'Ada Lovelace',
          kind: 'bare',
          field: 'name',
          record: 'contact',
          emittedLiteral: 'Ada Lovelace',
          issuedAt: 2
        }
      ]
    });
  });

  it('keeps exposures isolated by session id', () => {
    const registry = new ProjectionExposureRegistry();
    registry.record({
      sessionId: 'planner',
      value: 'mark@example.com',
      kind: 'mask',
      emittedPreview: 'm***@example.com',
      issuedAt: 1
    });
    registry.record({
      sessionId: 'worker',
      value: 'mark@example.com',
      kind: 'mask',
      emittedPreview: 'm***@example.com',
      issuedAt: 2
    });

    expect(registry.getEntries('planner')).toHaveLength(1);
    expect(registry.getEntries('worker')).toHaveLength(1);
    expect(registry.matchPreview('planner', 'm***@example.com').matches[0]?.issuedAt).toBe(1);
    expect(registry.matchPreview('worker', 'm***@example.com').matches[0]?.issuedAt).toBe(2);
  });

  it('reports ambiguity when more than one exposure matches the same preview', () => {
    const registry = new ProjectionExposureRegistry();
    registry.record({
      sessionId: 'session-a',
      value: 'sarah@company.com',
      kind: 'mask',
      emittedPreview: 's***@company.com',
      issuedAt: 1
    });
    registry.record({
      sessionId: 'session-a',
      value: 'steve@company.com',
      kind: 'mask',
      emittedPreview: 's***@company.com',
      issuedAt: 2
    });

    expect(registry.matchPreview('session-a', 's***@company.com')).toEqual({
      status: 'ambiguous',
      matches: [
        {
          sessionId: 'session-a',
          value: 'sarah@company.com',
          kind: 'mask',
          emittedPreview: 's***@company.com',
          issuedAt: 1
        },
        {
          sessionId: 'session-a',
          value: 'steve@company.com',
          kind: 'mask',
          emittedPreview: 's***@company.com',
          issuedAt: 2
        }
      ]
    });
  });

  it('does not create preview or literal aliases for handle-only entries', () => {
    const registry = new ProjectionExposureRegistry();
    registry.record({
      sessionId: 'session-a',
      value: 'file-123',
      kind: 'handle',
      handle: 'h_z9x8c7',
      field: 'id_',
      record: 'file_entry',
      issuedAt: 1
    });

    expect(registry.getEntries('session-a')).toEqual([
      {
        sessionId: 'session-a',
        value: 'file-123',
        kind: 'handle',
        handle: 'h_z9x8c7',
        field: 'id_',
        record: 'file_entry',
        issuedAt: 1
      }
    ]);
    expect(registry.matchPreview('session-a', 'file-123')).toEqual({
      status: 'none',
      matches: []
    });
    expect(registry.matchLiteral('session-a', 'file-123')).toEqual({
      status: 'none',
      matches: []
    });
  });
});
