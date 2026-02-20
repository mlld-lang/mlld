import { describe, it, expect } from 'vitest';
import { interpret } from '../../interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

/**
 * Regression tests for m-0ccb: Runtime errors in for-loop bodies
 * should propagate as thrown errors, not be silently wrapped as
 * {__error: true, __message: '...'} data objects.
 *
 * See: tk show m-0ccb
 */
describe('for-expression error propagation (m-0ccb)', () => {
  function createTestEnv() {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService(fileSystem, '/');
    return { fileSystem, pathService };
  }

  it('should throw when exe function errors in for-expression object property', async () => {
    const { fileSystem, pathService } = createTestEnv();
    const input = [
      '/var @x = "original"',
      '/exe @bomb() = [',
      '  let @x = "boom"',
      '  => "ok"',
      ']',
      '/var @results = for @n in [1, 2, 3] => {',
      '  number: @n,',
      '  status: @bomb()',
      '}',
    ].join('\n');

    // Currently this does NOT throw — the error is silently wrapped as
    // {__error: true, __message: '...'} in each iteration result.
    // Once m-0ccb is fixed, this should throw a VariableRedefinitionError.
    await expect(interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      mlldMode: 'markdown',
      ephemeral: true,
      useMarkdownFormatter: false,
    })).rejects.toThrow('variable-redefinition');
  });

  it('should not produce __error objects in for-expression results', async () => {
    const { fileSystem, pathService } = createTestEnv();
    const input = [
      '/var @x = "original"',
      '/exe @bomb() = [',
      '  let @x = "boom"',
      '  => "ok"',
      ']',
      '/var @results = for @n in [1, 2, 3] => {',
      '  number: @n,',
      '  status: @bomb()',
      '}',
      '/show @results',
    ].join('\n');

    // If the error doesn't throw (current broken behavior), the output will
    // contain __error objects. This test catches that case too.
    let output: string | undefined;
    try {
      const result = await interpret(input, {
        fileSystem,
        pathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false,
      });
      output = typeof result === 'string' ? result : JSON.stringify(result);
    } catch {
      // Error thrown is the correct behavior — test passes
      return;
    }

    // If we get here, interpret succeeded. The output should NOT contain __error.
    expect(output).not.toContain('__error');
  });
});
