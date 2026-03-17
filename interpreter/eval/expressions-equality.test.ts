import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isEqual, isTolerantMatch } from './expressions';

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

  it('matches tolerant comparison rules for common LLM output variations', () => {
    expect(isTolerantMatch('alice@example.com', ['alice@example.com'])).toBe(true);
    expect(isTolerantMatch(['alice@example.com'], 'alice@example.com')).toBe(true);
    expect(isTolerantMatch(
      ['bob@example.com', 'alice@example.com'],
      ['alice@example.com', 'bob@example.com']
    )).toBe(true);
    expect(isTolerantMatch(
      ['alice@example.com'],
      ['alice@example.com', 'bob@example.com']
    )).toBe(true);
    expect(isTolerantMatch('bob@example.com, alice@example.com', ['alice@example.com', 'bob@example.com'])).toBe(true);
    expect(isTolerantMatch('null', [])).toBe(true);
    expect(isTolerantMatch(null, 'null')).toBe(true);
    expect(isTolerantMatch('11', 11)).toBe(true);
    expect(isTolerantMatch([], ['alice@example.com'])).toBe(false);
    expect(isTolerantMatch(['mallory@example.com'], ['alice@example.com', 'bob@example.com'])).toBe(false);
  });

  it('evaluates ~= and !~= in interpreted expressions', async () => {
    const output = await interpret(
      [
        'var @single = "alice@example.com"',
        'var @ordered = ["bob@example.com", "alice@example.com"]',
        'var @none = "null"',
        'var @stringToArray = @single ~= ["alice@example.com"]',
        'var @subset = @single ~= ["alice@example.com", "bob@example.com"]',
        'var @unordered = @ordered ~= ["alice@example.com", "bob@example.com"]',
        'var @nullSafe = @none ~= []',
        'var @numeric = "11" ~= 11',
        'var @reject = @single !~= ["mallory@example.com"]',
        'show @stringToArray',
        'show @subset',
        'show @unordered',
        'show @nullSafe',
        'show @numeric',
        'show @reject'
      ].join('\n'),
      createOptions()
    );

    expect((output as string).trim()).toBe(['true', 'true', 'true', 'true', 'true', 'true'].join('\n'));
  });
});
