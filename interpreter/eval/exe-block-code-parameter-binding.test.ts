import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

async function run(source: string): Promise<string[]> {
  const output = await interpret(source, {
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService(),
    useMarkdownFormatter: false,
    normalizeBlankLines: true
  } as any);

  return (output as string)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

describe('exe block code parameter binding', () => {
  it('matches direct and exe-block behavior across sh/cmd/js/py/node', async () => {
    const lines = await run(
      [
        '/exe @directSh(x) = sh { echo "$x" }',
        '/exe @blockSh(x) = [',
        '  let @y = sh { echo "$x" }',
        '  => @y',
        ']',
        '/exe @directCmd(x) = cmd { echo "$x" }',
        '/exe @blockCmd(x) = [',
        '  let @y = cmd { echo "$x" }',
        '  => @y',
        ']',
        '/exe @directJs(x) = js { return x }',
        '/exe @blockJs(x) = [',
        '  let @y = js { return x }',
        '  => @y',
        ']',
        '/exe @directPy(x) = python {',
        'print(x)',
        '}',
        '/exe @blockPy(x) = [',
        '  let @y = python {',
        'print(x)',
        '}',
        '  => @y',
        ']',
        '/exe @directNode(x) = node { return x }',
        '/exe @blockNode(x) = [',
        '  let @y = node { return x }',
        '  => @y',
        ']',
        '/show @directSh("hello")',
        '/show @blockSh("hello")',
        '/show @directCmd("hello")',
        '/show @blockCmd("hello")',
        '/show @directJs("hello")',
        '/show @blockJs("hello")',
        '/show @directPy("hello")',
        '/show @blockPy("hello")',
        '/show @directNode("hello")',
        '/show @blockNode("hello")'
      ].join('\n')
    );

    expect(lines).toEqual([
      'hello',
      'hello',
      'hello',
      'hello',
      'hello',
      'hello',
      'hello',
      'hello',
      'hello',
      'hello'
    ]);
  });

  it('keeps parameter env binding for cmd blocks inside nested for bodies', async () => {
    const lines = await run(
      [
        '/exe @nestedCmd(x) = [',
        '  let @out = for @item in [1, 2] [',
        '    let @y = cmd { echo "$x" }',
        '    => @y',
        '  ]',
        '  => @out.join(",")',
        ']',
        '/show @nestedCmd("hello")'
      ].join('\n')
    );

    expect(lines).toEqual(['hello,hello']);
  });
});
