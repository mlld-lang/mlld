import { describe, it, expect } from 'vitest';
import { accessField, accessFields } from './field-access';
import { makeSecurityDescriptor, serializeSecurityDescriptor } from '@core/types/security';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import {
  createArrayVariable,
  createObjectVariable,
  createSimpleTextVariable,
  createStructuredValueVariable
} from '@core/types/variable/VariableFactories';
import {
  applySecurityDescriptorToStructuredValue,
  getRecordProjectionMetadata,
  wrapStructured
} from './structured-value';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { VirtualFS } from '@services/fs/VirtualFS';
import { buildGuardArgsSnapshot, createGuardArgsView } from './guard-args';

const source = {
  directive: 'var' as const,
  syntax: 'object' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createSecretObject() {
  const variable = createObjectVariable(
    'obj',
    { nested: { inner: { token: 'secret' } } },
    true,
    source
  );
  variable.mx = { labels: ['secret'] } as any;
  return variable;
}

describe('field access provenance', () => {
  it('inherits provenance when accessing single field', async () => {
    const variable = createSecretObject();
    const result = await accessField(variable, { type: 'field', value: 'nested' });
    const materialized = materializeExpressionValue(result as Record<string, unknown>, { name: 'nested' });
    expect(materialized?.mx?.labels).toContain('secret');
  });

  it('preserves provenance across multiple field accesses', async () => {
    const variable = createSecretObject();
    const fields = [
      { type: 'field', value: 'nested' } as const,
      { type: 'field', value: 'inner' } as const
    ];
    const result = await accessFields(variable, fields);
    const materialized = materializeExpressionValue((result as any).value ?? result, { name: 'inner' });
    expect(materialized?.mx?.labels).toContain('secret');
  });
});

describe('object mx utilities', () => {
  it('exposes keys, values, and entries on .mx', async () => {
    const variable = createObjectVariable(
      'obj',
      { a: 1, b: 2, c: 3 },
      false,
      source
    );

    const keys = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'keys' } as const
    ], { preserveContext: false });
    expect(keys).toEqual(['a', 'b', 'c']);

    const values = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'values' } as const
    ], { preserveContext: false });
    expect(values).toEqual([1, 2, 3]);

    const entries = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'entries' } as const
    ], { preserveContext: false });
    expect(entries).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('exposes labels on nested object results backed by provenance', async () => {
    const structured = wrapStructured(
      { nested: { value: 1 } },
      'object',
      '{"nested":{"value":1}}'
    );
    applySecurityDescriptorToStructuredValue(
      structured,
      makeSecurityDescriptor({ labels: ['untrusted'] })
    );
    const variable = createStructuredValueVariable('result', structured, source);

    const labels = await accessFields(variable, [
      { type: 'field', value: 'nested' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'labels' } as const
    ], { preserveContext: false });

    expect(labels).toEqual(['untrusted']);
  });
});

describe('record projection field access', () => {
  it('preserves field-level projection metadata when accessing structured record fields', async () => {
    const structured = wrapStructured(
      { email: 'ada@example.com', name: 'Ada' },
      'object',
      '{"email":"ada@example.com","name":"Ada"}',
      {
        projection: {
          kind: 'record',
          recordName: 'contact',
          display: {
            kind: 'legacy',
            entries: [
              { kind: 'mask', field: 'email' },
              { kind: 'bare', field: 'name' }
            ]
          },
          fields: {
            email: { classification: 'fact' },
            name: { classification: 'fact' }
          }
        }
      }
    );
    structured.internal = {
      ...(structured.internal ?? {}),
      namespaceMetadata: {
        email: {
          projection: {
            kind: 'field',
            recordName: 'contact',
            fieldName: 'email',
            classification: 'fact',
            display: {
              kind: 'legacy',
              entries: [
                { kind: 'mask', field: 'email' },
                { kind: 'bare', field: 'name' }
              ]
            }
          }
        }
      }
    };

    const result = await accessField(
      createStructuredValueVariable('contact', structured, source),
      { type: 'field', value: 'email' },
      { preserveContext: false }
    );

    expect(getRecordProjectionMetadata(result)).toEqual({
      kind: 'field',
      recordName: 'contact',
      fieldName: 'email',
      classification: 'fact',
      display: {
        kind: 'legacy',
        entries: [
          { kind: 'mask', field: 'email' },
          { kind: 'bare', field: 'name' }
        ]
      }
    });
  });

  it('lets post-coercion parent untrusted taint override refined fact fields', async () => {
    const structured = wrapStructured(
      { recipient: 'acct-1', subject: 'Rent' },
      'object',
      '{"recipient":"acct-1","subject":"Rent"}',
      {
        security: makeSecurityDescriptor({ labels: ['src:mcp'] })
      }
    );
    structured.internal = {
      ...(structured.internal ?? {}),
      namespaceMetadata: {
        recipient: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['fact:@transaction.recipient'] })
          )
        },
        subject: {
          security: serializeSecurityDescriptor(
            makeSecurityDescriptor({ labels: ['untrusted'] })
          )
        }
      }
    };
    applySecurityDescriptorToStructuredValue(
      structured,
      makeSecurityDescriptor({ labels: ['src:mcp', 'untrusted'] })
    );

    const result = await accessField(
      createStructuredValueVariable('tx', structured, source),
      { type: 'field', value: 'recipient' },
      { preserveContext: false }
    );

    expect((result as any).mx.labels).toEqual(
      expect.arrayContaining(['fact:@transaction.recipient', 'src:mcp', 'untrusted'])
    );
  });
});

describe('missing field access', () => {
  it('returns null for missing object fields by default', async () => {
    const result = await accessField({ a: 1 }, { type: 'field', value: 'missing' });
    expect(result).toBeNull();
  });

  it('returns undefined for missing fields when configured', async () => {
    const result = await accessField(
      { a: 1 },
      { type: 'field', value: 'missing' },
      { returnUndefinedForMissing: true }
    );
    expect(result).toBeUndefined();
  });

  it('does not leak Variable metadata for missing source fields on object variables', async () => {
    const variable = createObjectVariable(
      'obj',
      { nested: true },
      false,
      source
    );

    const result = await accessField(
      variable,
      { type: 'field', value: 'source' },
      { preserveContext: false }
    );

    expect(result).toBeNull();
  });

  it('returns undefined for missing source fields on object variables in condition mode', async () => {
    const variable = createObjectVariable(
      'obj',
      { nested: true },
      false,
      source
    );

    const result = await accessField(
      variable,
      { type: 'field', value: 'source' },
      { preserveContext: false, returnUndefinedForMissing: true }
    );

    expect(result).toBeUndefined();
  });

  it('keeps user data precedence when object variables define a source field', async () => {
    const variable = createObjectVariable(
      'obj',
      { source: 'user-data' },
      false,
      source
    );

    const result = await accessField(
      variable,
      { type: 'field', value: 'source' },
      { preserveContext: false }
    );

    expect(result).toBe('user-data');
  });

  it('returns null for out-of-bounds array indices', async () => {
    const result = await accessField([1, 2], { type: 'arrayIndex', value: 5 });
    expect(result).toBeNull();
  });

  it('indexes array Variable envelopes carried inside StructuredValue data', async () => {
    const arrayVariable = createArrayVariable(
      'resolved',
      [{ value: 'first' }],
      false,
      {
        directive: 'var',
        syntax: 'array',
        hasInterpolation: false,
        isMultiLine: false
      }
    );
    const wrapped = wrapStructured(arrayVariable, 'array', undefined);

    const result = await accessField(wrapped, { type: 'arrayIndex', value: 0 });

    expect(result).toEqual({ value: 'first' });
  });

  it('indexes serialized array Variable envelopes without source metadata', async () => {
    const envelope = {
      type: 'array',
      name: 'resolved',
      value: [{ value: 'first' }],
      labels: ['fact:@contact.email'],
      metadata: {
        isStructuredValue: true,
        structuredValueType: 'object'
      },
      tokens: [1]
    };

    const result = await accessField(envelope, { type: 'arrayIndex', value: 0 });
    const length = await accessField(envelope, { type: 'field', value: 'length' });

    expect(result).toEqual({ value: 'first' });
    expect(length).toBe(1);
  });

  it('adds an extension hint for common file suffix fields', async () => {
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('Cannot access field "json" on non-object value (string)');
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('\'@filename.json\' looks like field access');
    await expect(
      accessField('report', { type: 'field', value: 'json' }, { baseIdentifier: 'filename' })
    ).rejects.toThrow('escape the dot: \'@filename\\.json\'');
  });

  it('does not add extension hint text for non-extension fields', async () => {
    try {
      await accessField('report', { type: 'field', value: 'custom' }, { baseIdentifier: 'filename' });
      throw new Error('Expected field access to throw');
    } catch (error) {
      expect((error as Error).message).toContain('Cannot access field "custom" on non-object value (string)');
      expect((error as Error).message).not.toContain('looks like field access');
    }
  });
});

describe('guard args field access', () => {
  it('resolves dot-safe named args through field access', async () => {
    const variable = createSimpleTextVariable('value', 'classified', source);
    variable.mx = { labels: ['secret'] } as any;
    const view = createGuardArgsView(buildGuardArgsSnapshot([variable], ['value']));

    const argValue = await accessField(view, { type: 'field', value: 'value' }, { preserveContext: false });
    const labels = await accessFields(view, [
      { type: 'field', value: 'value' } as const,
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'labels' } as const
    ], { preserveContext: false });

    expect(argValue).toBe(variable);
    expect(labels).toEqual(['secret']);
  });

  it('resolves reserved and bracket-only guard arg names', async () => {
    const reserved = createSimpleTextVariable('names', 'classified', source);
    reserved.mx = { labels: ['secret'] } as any;
    const dashed = createSimpleTextVariable('repo-name', 'docs', source);
    const view = createGuardArgsView(buildGuardArgsSnapshot([reserved, dashed], ['names', 'repo-name']));

    const names = await accessField(view, { type: 'field', value: 'names' }, { preserveContext: false });
    const reservedValue = await accessField(view, { type: 'bracketAccess', value: 'names' }, { preserveContext: false });
    const dashedValue = await accessField(view, { type: 'bracketAccess', value: 'repo-name' }, { preserveContext: false });

    expect(names).toEqual(['names', 'repo-name']);
    expect(reservedValue).toBe(reserved);
    expect(dashedValue).toBe(dashed);
  });
});

describe('structured value mx accessors', () => {
  it('does not materialize wrapper text when reading other .mx helpers', async () => {
    let toJsonCalls = 0;
    const structured = wrapStructured(
      {
        stance: 'approved',
        toJSON() {
          toJsonCalls += 1;
          return { stance: 'approved' };
        }
      },
      'object'
    );
    const variable = createStructuredValueVariable('result', structured, source);

    const mxEntries = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'entries' } as const
    ], { preserveContext: false });
    expect(mxEntries).toEqual([['stance', 'approved'], ['toJSON', expect.any(Function)]]);
    expect(toJsonCalls).toBe(0);

    const mxView = await accessField(variable, { type: 'field', value: 'mx' }, { preserveContext: false });
    const textDescriptor = Object.getOwnPropertyDescriptor(mxView as object, 'text');
    expect(textDescriptor?.get).toBeTypeOf('function');
    expect(toJsonCalls).toBe(0);

    const mxText = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'text' } as const
    ], { preserveContext: false });
    expect(mxText).toBe('{"stance":"approved"}');
    expect(toJsonCalls).toBe(1);
  });

  it('maps .mx.text and .mx.data to wrapper-level views', async () => {
    const payload = { stance: 'approved', mx: 'user-mx' };
    const structured = wrapStructured(payload, 'object', 'RAW-PAYLOAD');
    const variable = createStructuredValueVariable('result', structured, source);

    const mxText = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'text' } as const
    ], { preserveContext: false });
    expect(mxText).toBe('RAW-PAYLOAD');

    const mxData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const
    ], { preserveContext: false });
    expect(mxData).toEqual(payload);

    const userMxThroughData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const,
      { type: 'field', value: 'mx' } as const
    ], { preserveContext: false });
    expect(userMxThroughData).toBe('user-mx');
  });

  it('keeps inherited .mx.schema metadata accessible on utility views', async () => {
    const structured = wrapStructured(
      {},
      'object',
      '{}',
      {
        schema: {
          valid: false,
          errors: [{ path: 'email', code: 'required', message: 'Missing required field' }],
          mode: 'demote'
        } as any
      }
    );
    const variable = createStructuredValueVariable('result', structured, source);

    const schemaValid = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'schema' } as const,
      { type: 'field', value: 'valid' } as const
    ], { preserveContext: false });

    expect(schemaValid).toBe(false);
  });

  it('keeps plain dotted access aligned with .mx.data', async () => {
    const payload = { stance: 'approved', score: 9 };
    const structured = wrapStructured(payload, 'object', '{"stance":"approved","score":9}');
    const variable = createStructuredValueVariable('result', structured, source);

    const direct = await accessField(variable, { type: 'field', value: 'stance' }, { preserveContext: false });
    const viaMx = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const,
      { type: 'field', value: 'stance' } as const
    ], { preserveContext: false });

    expect(direct).toBe('approved');
    expect(viaMx).toBe('approved');
  });

  it('exposes .mx.text and .mx.data on text wrappers', async () => {
    const structured = wrapStructured('hello', 'text', 'hello');
    const variable = createStructuredValueVariable('result', structured, source);

    const mxText = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'text' } as const
    ], { preserveContext: false });
    const mxData = await accessFields(variable, [
      { type: 'field', value: 'mx' } as const,
      { type: 'field', value: 'data' } as const
    ], { preserveContext: false });

    expect(mxText).toBe('hello');
    expect(mxData).toBe('hello');
  });

  it('falls back to wrapper text/data/type for primitive structured wrappers', async () => {
    const structured = wrapStructured('hello', 'text', 'hello');
    const variable = createStructuredValueVariable('result', structured, source);

    const topText = await accessField(variable, { type: 'field', value: 'text' }, { preserveContext: false });
    const topData = await accessField(variable, { type: 'field', value: 'data' }, { preserveContext: false });
    const topType = await accessField(variable, { type: 'field', value: 'type' }, { preserveContext: false });

    expect(topText).toBe('hello');
    expect(topData).toBe('hello');
    expect(topType).toBe('text');
  });

  it('keeps top-level text/data/type user-data-first for structured object wrappers', async () => {
    const structured = wrapStructured({ stance: 'approved' }, 'object', '{"stance":"approved"}');
    const variable = createStructuredValueVariable('result', structured, source);

    const topText = await accessField(variable, { type: 'field', value: 'text' }, { preserveContext: false });
    const topData = await accessField(variable, { type: 'field', value: 'data' }, { preserveContext: false });
    const topType = await accessField(variable, { type: 'field', value: 'type' }, { preserveContext: false });

    expect(topText).toBeNull();
    expect(topData).toBeNull();
    expect(topType).toBe('structured');
  });

  it('does not expose wrapper metadata as top-level fields', async () => {
    const structured = wrapStructured(
      { status: 'user-status' },
      'object',
      '{"status":"user-status"}',
      { filename: 'meta.json', source: 'load-content' }
    );
    const variable = createStructuredValueVariable('result', structured, source);

    const topLevelFilename = await accessField(
      variable,
      { type: 'field', value: 'filename' },
      { preserveContext: false }
    );
    expect(topLevelFilename).toBeNull();

    const mxFilename = await accessFields(
      variable,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'filename' } as const
      ],
      { preserveContext: false }
    );
    expect(mxFilename).toBe('meta.json');
  });

  it('keeps user data fields first for collisions like type/text/data', async () => {
    const payload = {
      type: 'user-type',
      text: 'user-text',
      data: 'user-data'
    };
    const structured = wrapStructured(payload, 'object', 'RAW');
    const variable = createStructuredValueVariable('result', structured, source);

    const topType = await accessField(variable, { type: 'field', value: 'type' }, { preserveContext: false });
    const topText = await accessField(variable, { type: 'field', value: 'text' }, { preserveContext: false });
    const topData = await accessField(variable, { type: 'field', value: 'data' }, { preserveContext: false });

    expect(topType).toBe('user-type');
    expect(topText).toBe('user-text');
    expect(topData).toBe('user-data');

    const mxType = await accessFields(
      variable,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'type' } as const
      ],
      { preserveContext: false }
    );
    expect(mxType).toBe('object');
  });
});

describe('workspace metadata accessors', () => {
  it('resolves @workspace.mx.edits and @workspace.mx.diff from VirtualFS state', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/old.txt', 'old\n');
    await backing.writeFile('/project/remove.txt', 'remove\n');
    const vfs = VirtualFS.over(backing);
    await vfs.writeFile('/project/old.txt', 'updated\n');
    await vfs.writeFile('/project/new.txt', 'new\n');
    await vfs.rm('/project/remove.txt');

    const workspace = {
      type: 'workspace' as const,
      fs: vfs,
      descriptions: new Map<string, string>()
    };

    const env = new Environment(backing, new PathService(), '/project');
    const workspaceVar = createObjectVariable('workspace', workspace as Record<string, unknown>, true, source);
    env.setVariable('workspace', workspaceVar);

    const edits = await accessFields(
      workspaceVar,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'edits' } as const
      ],
      { preserveContext: false, env }
    );
    const diff = await accessFields(
      workspaceVar,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'diff' } as const
      ],
      { preserveContext: false, env }
    );

    expect(diff).toEqual(edits);
    expect(edits).toEqual([
      { path: '/project/new.txt', type: 'created', entity: 'file' },
      { path: '/project/old.txt', type: 'modified', entity: 'file' },
      { path: '/project/remove.txt', type: 'deleted', entity: 'file' }
    ]);
  });

  it('resolves @file.mx.diff using workspace file metadata path', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile('/project/task.md', 'one\ntwo\n');
    const vfs = VirtualFS.over(backing);
    await vfs.writeFile('/project/task.md', 'one\nTWO\nthree\n');

    const workspace = {
      type: 'workspace' as const,
      fs: vfs,
      descriptions: new Map<string, string>()
    };

    const env = new Environment(backing, new PathService(), '/project');
    const workspaceVar = createObjectVariable('workspace', workspace as Record<string, unknown>, true, source);
    env.setVariable('workspace', workspaceVar);

    const fileVar = createSimpleTextVariable('task', 'one\nTWO\nthree\n', source, {
      mx: {
        path: '/project/task.md',
        absolute: '/project/task.md',
        relative: 'task.md',
        filename: 'task.md'
      }
    });

    const diff = await accessFields(
      fileVar,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'diff' } as const
      ],
      { preserveContext: false, env }
    );

    expect(typeof diff).toBe('string');
    expect(diff).toContain('--- a/project/task.md');
    expect(diff).toContain('+++ b/project/task.md');
    expect(diff).toContain('-two');
    expect(diff).toContain('+TWO');
    expect(diff).toContain('+three');
  });

  it('filters project-root ancestor directories from workspace mx.edits output', async () => {
    const backing = new MemoryFileSystem();
    const vfs = VirtualFS.empty();
    await vfs.writeFile('/repo/project/task.md', 'draft\n');

    const workspace = {
      type: 'workspace' as const,
      fs: vfs,
      descriptions: new Map<string, string>()
    };

    const env = new Environment(backing, new PathService(), '/repo/project');
    const workspaceVar = createObjectVariable('workspace', workspace as Record<string, unknown>, true, source);
    env.setVariable('workspace', workspaceVar);

    const edits = await accessFields(
      workspaceVar,
      [
        { type: 'field', value: 'mx' } as const,
        { type: 'field', value: 'edits' } as const
      ],
      { preserveContext: false, env }
    );

    expect(edits).toEqual([
      { path: '/repo/project/task.md', type: 'created', entity: 'file' }
    ]);
  });

  describe('wildcardIndex [*]', () => {
    it('projects a field across array elements', async () => {
      const items = [
        { name: 'readData', auditRef: 'a1' },
        { name: 'debiasedEval', auditRef: 'a2' },
        { name: 'sendEmail', auditRef: 'a3' }
      ];
      const variable = createObjectVariable('history', { items }, true, source);

      const names = await accessFields(
        variable,
        [
          { type: 'field', value: 'items' } as const,
          { type: 'wildcardIndex' } as const,
          { type: 'field', value: 'name' } as const
        ],
        { preserveContext: false }
      );
      expect(names).toEqual(['readData', 'debiasedEval', 'sendEmail']);
    });

    it('projects nested fields across array elements', async () => {
      const items = [
        { meta: { id: 1 } },
        { meta: { id: 2 } },
        { meta: { id: 3 } }
      ];
      const variable = createObjectVariable('deep', { items }, true, source);

      const ids = await accessFields(
        variable,
        [
          { type: 'field', value: 'items' } as const,
          { type: 'wildcardIndex' } as const,
          { type: 'field', value: 'meta' } as const,
          { type: 'field', value: 'id' } as const
        ],
        { preserveContext: false }
      );
      expect(ids).toEqual([1, 2, 3]);
    });

    it('returns the array as-is when [*] has no trailing fields', async () => {
      const arr = [1, 2, 3];
      const result = await accessFields(
        arr,
        [{ type: 'wildcardIndex' } as const],
        { preserveContext: false }
      );
      expect(result).toEqual([1, 2, 3]);
    });

    it('throws on non-array values', async () => {
      await expect(
        accessFields(
          'not-an-array',
          [{ type: 'wildcardIndex' } as const, { type: 'field', value: 'x' } as const],
          { preserveContext: false }
        )
      ).rejects.toThrow('Cannot use [*] on non-array value');
    });
  });
});
