import { describe, expect, it } from 'vitest';
import type { RecordDefinition } from '@core/types/record';
import { buildSessionDefinition, buildSessionDefinitionFromDirective } from './session-definition';

function makeRecord(overrides: Partial<RecordDefinition> = {}): RecordDefinition {
  return {
    name: 'contact',
    direction: 'bidirectional',
    display: { kind: 'open' },
    fields: [],
    when: undefined,
    ...overrides
  } as RecordDefinition;
}

describe('session definition validation', () => {
  it('rejects secret-like labels on session schemas', () => {
    const result = buildSessionDefinitionFromDirective({
      values: {
        identifier: [{ identifier: 'planner' }],
        value: [{
          entries: [{
            type: 'pair',
            key: 'count',
            value: {
              type: 'sessionType',
              base: { kind: 'primitive', name: 'number' },
              optional: true,
              isArray: false
            }
          }]
        }]
      },
      meta: {
        isSessionLabel: true,
        securityLabels: ['secret']
      }
    });

    expect(result.definition).toBeUndefined();
    expect(result.issues.map(issue => issue.message)).toContain(
      'Session schemas cannot carry secret, untrusted, or pii labels.'
    );
  });

  it('rejects var tools + session combinations', () => {
    const result = buildSessionDefinitionFromDirective({
      values: {
        identifier: [{ identifier: 'planner' }],
        value: [{
          entries: [{
            type: 'pair',
            key: 'count',
            value: {
              type: 'sessionType',
              base: { kind: 'primitive', name: 'number' },
              optional: true,
              isArray: false
            }
          }]
        }]
      },
      meta: {
        isSessionLabel: true,
        isToolsCollection: true
      }
    });

    expect(result.definition).toBeUndefined();
    expect(result.issues.map(issue => issue.message)).toContain(
      'Session schemas cannot be combined with `var tools`.'
    );
  });

  it('rejects dynamic session schema keys', () => {
    const result = buildSessionDefinition({
      identifier: 'planner',
      valueNode: {
        entries: [{
          type: 'pair',
          key: { type: 'ExecInvocation', name: 'dynamicKey' },
          value: {
            type: 'sessionType',
            base: { kind: 'primitive', name: 'string' },
            optional: false,
            isArray: false
          }
        }]
      }
    });

    expect(result.definition).toBeUndefined();
    expect(result.issues.map(issue => issue.message)).toContain(
      'Session schema keys must be static identifiers or quoted strings.'
    );
  });

  it('rejects record slot types that are not session-safe', () => {
    const result = buildSessionDefinition({
      identifier: 'planner',
      valueNode: {
        entries: [{
          type: 'pair',
          key: 'selected',
          value: {
            type: 'sessionType',
            base: { kind: 'record', name: 'contact' },
            optional: true,
            isArray: false
          }
        }]
      },
      resolveRecord: () => makeRecord({ display: { kind: 'legacy', entries: [] } as any })
    });

    expect(result.definition).toBeUndefined();
    expect(result.issues.map(issue => issue.message)).toContain(
      "Record '@contact' cannot be used as a session slot type. Session slot records must be input-capable, open-display, and must not define when-rules."
    );
  });

  it('builds valid primitive and record-backed session slots', () => {
    const result = buildSessionDefinition({
      identifier: 'planner',
      filePath: '/tmp/example.mld',
      sourceLocation: {
        filePath: '/tmp/example.mld',
        line: 1,
        column: 1
      },
      valueNode: {
        entries: [
          {
            type: 'pair',
            key: 'count',
            value: {
              type: 'sessionType',
              base: { kind: 'primitive', name: 'number' },
              optional: true,
              isArray: false
            }
          },
          {
            type: 'pair',
            key: 'selected',
            value: {
              type: 'sessionType',
              base: { kind: 'record', name: 'contact' },
              optional: true,
              isArray: false
            }
          }
        ]
      },
      resolveRecord: () => makeRecord()
    });

    expect(result.issues).toEqual([]);
    expect(result.definition).toMatchObject({
      canonicalName: 'planner',
      id: '/tmp/example.mld#planner',
      slots: {
        count: {
          name: 'count',
          type: {
            kind: 'primitive',
            name: 'number',
            optional: true,
            isArray: false
          }
        },
        selected: {
          name: 'selected',
          type: {
            kind: 'record',
            name: 'contact',
            optional: true,
            isArray: false
          }
        }
      }
    });
  });
});
