import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

type AnyNode = Record<string, unknown>;

function hasNode(value: unknown, predicate: (node: AnyNode) => boolean): boolean {
  if (value && typeof value === 'object') {
    const node = value as AnyNode;
    if (predicate(node)) return true;
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        if (child.some((item) => hasNode(item, predicate))) return true;
      } else if (hasNode(child, predicate)) {
        return true;
      }
    }
  }
  return false;
}

describe('Block for grammar', () => {
  it('parses /for block without arrow and supports let/+= statements', () => {
    const ast = parseSync(`/for @item in [1] [\n  let @x = 1\n  @x += 2\n]`);
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('for');
    expect(directive.meta?.actionType).toBe('block');
    expect(directive.meta?.block?.statementCount).toBe(2);
  });

  it('parses nested for and when blocks inside exe block', () => {
    const ast = parseSync(`/exe @demo() = [\n  for @item in @items [\n    when [@item => [\n      show "ok"\n    ]]\n  ]\n  => @items\n]`);
    const exe = ast[0];

    expect(hasNode(exe, (node) => node.kind === 'for' && node.meta?.isNested)).toBe(true);
    expect(hasNode(exe, (node) => node.type === 'WhenExpression')).toBe(true);
  });

  it('parses nested for guards with block returns', () => {
    const ast = parseSync(
      `/exe @demo(results) = [\n` +
        `  for @r in @results when @r.gaps.length > 0 [\n` +
        `    let @gapList = for @g in @r.gaps => \`  - @g\`\n` +
        `    => \`### @r.file\\n@r.notes\\n@gapList\\n\`\n` +
        `  ]\n` +
        `  => "ok"\n` +
        `]`
    );
    const exe = ast[0];

    expect(hasNode(exe, (node) => node.kind === 'for' && node.meta?.isNested)).toBe(true);
    expect(hasNode(exe, (node) => node.type === 'WhenExpression')).toBe(true);
  });

  it('parses for expression block form without arrow', () => {
    const ast = parseSync(`/var @out = for @x in @xs [\n  @x\n]`);

    expect(hasNode(ast, (node) => node.meta?.isForExpression === true)).toBe(true);
  });

  it('allows done/continue in when actions', () => {
    const ast = parseSync(`/exe @countdown(n) = when [\n  @n <= 0 => done "finished"\n  * => continue (@n - 1)\n]`);

    expect(hasNode(ast, (node) => node.valueType === 'continue')).toBe(true);
    expect(hasNode(ast, (node) => node.valueType === 'done')).toBe(true);
  });

  it('parses single-line for block statements separated by semicolons', () => {
    const ast = parseSync(`/for @item in [1, 2] [show @item; let @count += 1]`);
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('for');
    expect(directive.meta?.block?.statementCount).toBe(2);
  });

  it('parses single-line exe block statements separated by semicolons', () => {
    const ast = parseSync(`/exe @sum(a, b) = [let @x = @a; let @y = @b; => @x + @y]`);
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('exe');
    expect(directive.meta?.statementCount).toBe(2);
    expect(hasNode(directive, (node) => node.type === 'ExeReturn')).toBe(true);
  });

  it('parses run statements inside exe blocks', () => {
    const ast = parseSync(
      `/exe @demo() = [\n` +
        `  run @otherfunc(@somevalue)\n` +
        `  run cmd {echo hi}\n` +
        `  run js {return "hi"}\n` +
        `  run "echo hi"\n` +
        `  run @somevalue | cmd {echo hi}\n` +
        `  => "done"\n` +
        `]`
    );
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('exe');
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runExec')).toBe(true);
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runCommand')).toBe(true);
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runCode')).toBe(true);
  });

  it('parses run statements inside for blocks', () => {
    const ast = parseSync(
      `/for @item in [1] [\n` +
        `  run @otherfunc(@item)\n` +
        `  run "echo hi"\n` +
        `  run @item | cmd {echo hi}\n` +
        `  run cmd {echo hi}\n` +
        `  run js {return 1}\n` +
        `]`
    );
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('for');
    expect(directive.meta?.block?.statementCount).toBe(5);
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runExec')).toBe(true);
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runCommand')).toBe(true);
    expect(hasNode(directive, (node) => node.kind === 'run' && node.subtype === 'runCode')).toBe(true);
  });
});
