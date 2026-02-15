import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('expression plus operator behavior', () => {
  function createOptions() {
    return {
      fileSystem: new MemoryFileSystem(),
      pathService: new PathService(),
      mlldMode: 'strict',
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    } as any;
  }

  it('throws a helpful error for string concatenation with +', async () => {
    const input = [
      'var @a = "hello"',
      'var @b = "world"',
      'var @c = @a + @b',
      'show @c'
    ].join('\n');

    try {
      await interpret(input, createOptions());
      expect.fail('Expected string + string to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('String concatenation with + is not supported. Use template strings instead.');
      expect(message).toContain('`@first @second` instead of @first + @second');
    }
  });

  it('keeps numeric arithmetic behavior for +', async () => {
    const output = await interpret(
      [
        'var @x = 5 + 3',
        'show @x'
      ].join('\n'),
      createOptions()
    );

    expect((output as string).trim()).toBe('8');
  });

  it('keeps mixed string-number + behavior as NaN', async () => {
    const output = await interpret(
      [
        'var @x = "hello" + 5',
        'show @x'
      ].join('\n'),
      createOptions()
    );

    expect((output as string).trim()).toBe('NaN');
  });
});
