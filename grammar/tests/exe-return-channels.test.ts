import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

type AnyNode = Record<string, unknown>;

function findNodes(value: unknown, predicate: (node: AnyNode) => boolean): AnyNode[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const node = value as AnyNode;
  const matches = predicate(node) ? [node] : [];
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        matches.push(...findNodes(item, predicate));
      }
      continue;
    }
    matches.push(...findNodes(child, predicate));
  }
  return matches;
}

describe('exe return channels grammar', () => {
  it('parses tool and dual return channels inside exe-local blocks', () => {
    const ast = parseSync(
      `/exe @route(task) = [
  -> "tool-slot"
  if @task.blocked [-> "blocked"]
  when @task.mode == "fast" => [=-> "fast"]
  => "slow"
]`
    );

    const returns = findNodes(ast, (node) => node.type === 'ExeReturn');
    expect(returns.map(node => node.kind)).toEqual(['tool', 'tool', 'dual', 'canonical']);
  });

  it('parses tool return channels inside exe-for expressions', () => {
    const ast = parseSync(
      `/exe @sendBatch(emails) = for @email in @emails => [
  -> "sent"
  => "done"
]`
    );

    const returns = findNodes(ast, (node) => node.type === 'ExeReturn');
    expect(returns).toHaveLength(2);
    expect(returns[0]?.kind).toBe('tool');
    expect(returns[1]?.kind).toBe('canonical');
  });

  it('rejects unreachable tool returns after canonical returns with a targeted error', () => {
    expect(() =>
      parseSync(
        `/exe @route() = [
  => "canonical"
  -> "tool"
]`
      )
    ).toThrow(/Unreachable tool return in exe block/);
  });

  it('rejects unreachable statements after terminating dual returns with a targeted error', () => {
    expect(() =>
      parseSync(
        `/exe @route() = [
  =-> "both"
  show "later"
]`
      )
    ).toThrow(/Unreachable statement in exe block/);
  });

  it('rejects thin-arrow returns at top level in strict mode', () => {
    expect(() => parseSync('-> "nope"', { mode: 'strict' })).toThrow(/Text content not allowed in strict mode/);
    expect(() => parseSync('=-> "nope"', { mode: 'strict' })).toThrow(/Text content not allowed in strict mode/);
  });

  it('keeps top-level canonical returns valid in strict mode', () => {
    const ast = parseSync('=> "ok"', { mode: 'strict' });
    const returns = findNodes(ast, (node) => node.type === 'ExeReturn');

    expect(returns).toHaveLength(1);
    expect((ast[0] as AnyNode)?.kind).toBe('canonical');
    expect(returns[0]?.kind).toBe('canonical');
  });
});
