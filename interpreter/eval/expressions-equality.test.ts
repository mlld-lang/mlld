import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isEqual } from './expressions';

describe('expression equality', () => {
  function createOptions() {
    return {
      fileSystem: new MemoryFileSystem(),
      pathService: new PathService(),
      mlldMode: 'strict',
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    } as any;
  }

  it('evaluates array literal equality through binary expressions', async () => {
    const output = await interpret(
      [
        'var @recipients = ["alice@example.com"]',
        'var @same = @recipients == ["alice@example.com"]',
        'var @different = @recipients != ["alice@example.com"]',
        'var @other = @recipients == ["bob@example.com"]',
        'show @same',
        'show @different',
        'show @other'
      ].join('\n'),
      createOptions()
    );

    expect((output as string).trim()).toBe(['true', 'false', 'false'].join('\n'));
  });

  it('applies mlld coercion rules recursively within nested arrays', () => {
    expect(
      isEqual(
        [1, 'true', null, [['alice@example.com'], ['2', false]]],
        ['1', true, undefined, [['alice@example.com'], [2, 'false']]]
      )
    ).toBe(true);
  });
});
