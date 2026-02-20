import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

function readLiteralCheckpointName(node: DirectiveNode): string | null {
  const value = node.values?.name;
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const literal = value as Record<string, unknown>;
    if (literal.type === 'Literal' && typeof literal.value === 'string') {
      return literal.value;
    }
  }
  return null;
}

function collectCheckpointDirectives(node: unknown, out: DirectiveNode[] = []): DirectiveNode[] {
  if (!node || typeof node !== 'object') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectCheckpointDirectives(child, out);
    }
    return out;
  }

  const record = node as Record<string, unknown>;
  if (record.type === 'Directive' && record.kind === 'checkpoint') {
    out.push(record as unknown as DirectiveNode);
  }

  for (const value of Object.values(record)) {
    collectCheckpointDirectives(value, out);
  }
  return out;
}

describe('Checkpoint directive', () => {
  it('parses /checkpoint with a quoted name', () => {
    const ast = parseSync('/checkpoint "review-start"', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;

    expect(node.kind).toBe('checkpoint');
    expect(node.subtype).toBe('checkpoint');
    expect(readLiteralCheckpointName(node)).toBe('review-start');
  });

  it('parses single-quoted checkpoint names as literals', () => {
    const ast = parseSync('/checkpoint \'stage-a\'', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;

    expect(node.kind).toBe('checkpoint');
    expect(readLiteralCheckpointName(node)).toBe('stage-a');
  });

  it('parses backtick checkpoint names with interpolation support', () => {
    const ast = parseSync('/checkpoint `@stage-name`', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;
    const value = node.values.name as Record<string, unknown>;

    expect(node.kind).toBe('checkpoint');
    expect(value.wrapperType).toBe('backtick');
    expect(value.hasInterpolation).toBe(true);
  });

  it('supports inline comments', () => {
    const ast = parseSync('/checkpoint "stage-a" >> marker', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;

    expect(node.kind).toBe('checkpoint');
    expect(readLiteralCheckpointName(node)).toBe('stage-a');
    expect(node.meta.comment).toBeDefined();
  });

  it('supports checkpoints as direct actions in all top-level when forms', () => {
    const ast = parseSync(`
/when [
  @x == "high" => checkpoint "deep-path"
]
/when @tier [
  "high" => checkpoint "tier-high"
]
/when @enabled => checkpoint "inline-path"
`.trim(), { mode: 'strict' });

    const checkpoints = collectCheckpointDirectives(ast);
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints.every(node => node.meta?.checkpointContext === 'top-level-when-direct')).toBe(true);
  });

  it('parses checkpoints nested inside when block actions for validator enforcement', () => {
    const ast = parseSync('/when @enabled => [ checkpoint "nested" ]', { mode: 'strict' });
    const checkpoints = collectCheckpointDirectives(ast);

    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].meta?.checkpointContext).toBe('when-action-block');
  });

  it('parses checkpoints in when expressions for validator enforcement', () => {
    const ast = parseSync('/var @phase = when [ * => checkpoint "not-allowed" ]', { mode: 'strict' });
    const checkpoints = collectCheckpointDirectives(ast);

    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].meta?.checkpointContext).toBe('when-expression-action');
  });

  it('rejects missing checkpoint name', () => {
    expect(() => parseSync('/checkpoint', { mode: 'strict' })).toThrow();
  });
});
