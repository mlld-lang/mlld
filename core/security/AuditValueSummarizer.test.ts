import { describe, expect, it } from 'vitest';
import {
  summarizeAuditValue,
  enforceAuditRecordCap,
  AUDIT_DEFAULT_MAX_RECORD_BYTES
} from './AuditValueSummarizer';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@core/utils/environment-identity';

describe('summarizeAuditValue', () => {
  it('passes through small primitives and short strings', () => {
    expect(summarizeAuditValue('hello')).toBe('hello');
    expect(summarizeAuditValue(42)).toBe(42);
    expect(summarizeAuditValue(true)).toBe(true);
    expect(summarizeAuditValue(null)).toBe(null);
    expect(summarizeAuditValue(undefined)).toBe(undefined);
  });

  it('collapses long strings to preview + length', () => {
    const long = 'x'.repeat(2000);
    const result = summarizeAuditValue(long) as Record<string, unknown>;
    expect(result.len).toBe(2000);
    expect((result.__str as string).length).toBeLessThanOrEqual(512);
    expect(result.truncated).toBe(2000 - 512);
  });

  it('drops known runtime plumbing keys', () => {
    const value = {
      name: 'send_email',
      recipients: ['a@b.co'],
      capturedModuleEnv: { mcp: { large: 'blob' } },
      executableDef: { codeTemplate: [{ type: 'ExeBlock' }] },
      parentEnvironment: { huge: 'object' }
    };
    const result = summarizeAuditValue(value) as Record<string, unknown>;
    expect(result.name).toBe('send_email');
    expect(result.recipients).toEqual(['a@b.co']);
    expect(result.capturedModuleEnv).toBe('[omitted]');
    expect(result.executableDef).toBe('[omitted]');
    expect(result.parentEnvironment).toBe('[omitted]');
  });

  it('preserves mlld wrapper identifiers but strips internal plumbing', () => {
    const value = {
      mlld: {
        type: 'executable',
        name: 'get_unread_emails',
        paramNames: ['since'],
        internal: { isImported: true, executableDef: { massive: true } }
      }
    };
    const result = summarizeAuditValue(value) as Record<string, unknown>;
    const mlld = result.mlld as Record<string, unknown>;
    expect(mlld.type).toBe('executable');
    expect(mlld.name).toBe('get_unread_emails');
    expect(mlld.paramNames).toEqual(['since']);
    expect(mlld.internal).toBe('[omitted]');
  });

  it('collapses AST nodes to {__ast: type}', () => {
    const node = {
      type: 'ExeBlock',
      nodeId: 'abc-123',
      location: { source: 'file.mld', start: { line: 1, column: 1 } },
      values: { statements: [], return: { deep: { nested: 'data' } } }
    };
    const result = summarizeAuditValue(node);
    expect(result).toEqual({ __ast: 'ExeBlock' });
  });

  it('replaces tagged environment objects with a sentinel', () => {
    const env: Record<string, unknown> = {
      huge: new Array(1000).fill('x'),
      variables: new Map([['a', 1]])
    };
    markEnvironment(env);
    const result = summarizeAuditValue({ env, other: 'value' }) as Record<string, unknown>;
    expect(result.env).toBe(ENVIRONMENT_SERIALIZE_PLACEHOLDER);
    expect(result.other).toBe('value');
  });

  it('caps arrays at maxArrayLength with __omitted marker', () => {
    const arr = new Array(100).fill(0).map((_, i) => i);
    const result = summarizeAuditValue(arr, { maxArrayLength: 10 }) as unknown[];
    expect(result.length).toBe(11);
    expect(result.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result[10]).toEqual({ __omitted: 90 });
  });

  it('caps depth with a class marker', () => {
    let deep: Record<string, unknown> = { leaf: 'bottom' };
    for (let i = 0; i < 20; i++) {
      deep = { nested: deep };
    }
    const result = JSON.stringify(summarizeAuditValue(deep));
    expect(result.length).toBeLessThan(200);
  });

  it('handles circular references without recursing', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a.b = b;
    const result = summarizeAuditValue(a) as Record<string, unknown>;
    expect(result.name).toBe('a');
    expect(((result.b as Record<string, unknown>).a as unknown)).toBe('[Circular]');
  });

  it('drops a realistic tool-catalog captured-env blob to a small record', () => {
    // Mirrors the shape seen in .mlld/sec/audit.jsonl that produced 7MB lines.
    const toolsArg = {
      tools: {
        get_unread_emails: {
          kind: 'read',
          mlld: {
            type: 'executable',
            name: 'get_unread_emails',
            paramNames: [],
            internal: {
              isImported: true,
              importPath: '/some/path/tools.mld',
              executableDef: {
                type: 'code',
                codeTemplate: new Array(50).fill({
                  type: 'ExeBlock',
                  nodeId: 'xyz',
                  location: { source: 'x' },
                  values: {
                    statements: [],
                    return: { deep: new Array(100).fill('x'.repeat(500)) }
                  }
                })
              }
            },
            capturedModuleEnv: {
              mcp: Object.fromEntries(
                new Array(20).fill(0).map((_, i) => [
                  `tool${i}`,
                  {
                    type: 'executable',
                    name: `tool${i}`,
                    value: { template: 'x'.repeat(2000) }
                  }
                ])
              )
            }
          }
        }
      }
    };
    const serialized = JSON.stringify(summarizeAuditValue(toolsArg));
    expect(serialized.length).toBeLessThan(2048);
  });
});

describe('enforceAuditRecordCap', () => {
  it('returns the record unchanged when it fits', () => {
    const record = { id: '1', event: 'toolCall', tool: 'x', args: { a: 1 } };
    expect(enforceAuditRecordCap(record)).toBe(record);
  });

  it('stubs args when the record exceeds the cap', () => {
    const huge = 'x'.repeat(AUDIT_DEFAULT_MAX_RECORD_BYTES * 2);
    const record = {
      id: 'abc',
      ts: '2026-04-16T00:00:00Z',
      event: 'toolCall',
      tool: 'paste',
      args: { body: huge, other: 'keep' },
      taint: ['untrusted']
    };
    const capped = enforceAuditRecordCap(record);
    expect(capped.id).toBe('abc');
    expect(capped.tool).toBe('paste');
    expect(capped.taint).toEqual(['untrusted']);
    expect(capped.args).toMatchObject({ __truncated: true });
    expect((capped.args as Record<string, unknown>).argKeys).toEqual(['body', 'other']);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(AUDIT_DEFAULT_MAX_RECORD_BYTES);
  });
});
