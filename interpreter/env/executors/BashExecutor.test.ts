import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BashExecutor } from './BashExecutor';
import type { ErrorUtils } from '../ErrorUtils';
import type { VariableProvider } from './BashExecutor';
import { StreamBus } from '@interpreter/eval/pipeline/stream-bus';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

/**
 * Create a mock child process that captures stdin writes and emits stdout/close.
 */
function createMockChild(stdout = 'test output') {
  const stdinChunks: string[] = [];
  const stdinEmitter = new EventEmitter();
  const stdin = Object.assign(stdinEmitter, {
    write: vi.fn((data: string) => { stdinChunks.push(data); }),
    end: vi.fn()
  });
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const child = new EventEmitter() as any;
  child.stdin = stdin;
  child.stdout = stdoutEmitter;
  child.stderr = stderrEmitter;
  child.pid = 123;
  child._stdinChunks = stdinChunks;

  // After stdin.end(), emit stdout data then close
  stdin.end.mockImplementation(() => {
    process.nextTick(() => {
      stdoutEmitter.emit('data', Buffer.from(stdout));
      process.nextTick(() => {
        child.emit('close', 0);
      });
    });
  });

  return child;
}

vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    spawn: vi.fn(original.spawn)
  };
});

describe('BashExecutor - Heredoc Support', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockErrorUtils: ErrorUtils;
  let mockVariableProvider: VariableProvider;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockErrorUtils = {
      handleCommandError: vi.fn(),
      createError: vi.fn()
    } as any;
    mockVariableProvider = {
      getVariables: vi.fn(() => new Map())
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Heredoc Generation', () => {
    it('should use heredocs for large variables when enabled', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100'; // Very small for testing

      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200); // Exceeds 100 bytes

      const mockChild = createMockChild('test output');
      const spawnSpy = vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "Value: $testvar"',
        {},
        undefined,
        { testvar: largeContent }
      );

      expect(spawnSpy).toHaveBeenCalled();
      const script = mockChild._stdinChunks.join('');

      // Verify heredoc structure using cat heredoc
      expect(script).toContain("testvar=$(cat <<'MLLD_EOF_");
      expect(script).toContain(largeContent);
      // Oversized vars are no longer exported; they remain local shell vars
      expect(script).not.toContain('export testvar');
      expect(script).toContain('echo "Value: $testvar"');
    });

    it('should not use heredocs when disabled', async () => {
      process.env.MLLD_BASH_HEREDOC = 'false';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';

      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200);

      const mockChild = createMockChild('test output');
      const spawnSpy = vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "Value: $testvar"',
        {},
        undefined,
        { testvar: largeContent }
      );

      const script = mockChild._stdinChunks.join('');
      const spawnOptions = spawnSpy.mock.calls[0][2] as any;

      // Should not have heredoc in script
      expect(script).not.toContain('MLLD_EOF_');
      // Should have variable in environment
      expect(spawnOptions.env.testvar).toBe(largeContent);
    });

    it('should sanitize variable names with special characters', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';

      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200);

      const mockChild = createMockChild('test output');
      vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "Value: $my_var_name"',
        {},
        undefined,
        { 'my-var-name': largeContent } // Note the dashes
      );

      const script = mockChild._stdinChunks.join('');

      // Should use sanitized name
      expect(script).toContain("my_var_name=$(cat <<'MLLD_EOF_");
      // No export for oversized vars; alias should map original -> sanitized
      expect(script).toContain('my-var-name="$my_var_name"');
    });

    it('should handle EOF marker collision', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';

      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());

      // Content that could collide with a marker
      const largeContent = 'x'.repeat(100) + '\nMLLD_EOF_test\n' + 'y'.repeat(100);

      const mockChild = createMockChild('test output');
      vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "Done"',
        {},
        undefined,
        { testvar: largeContent }
      );

      const script = mockChild._stdinChunks.join('');

      // Extract the actual marker used
      const markerMatch = script.match(/testvar=\$\(cat <<'(MLLD_EOF_[^']+)'/);
      expect(markerMatch).toBeTruthy();
      const marker = markerMatch![1];

      // The marker should not exist in the content
      expect(largeContent).not.toContain(marker);
    });

    it('should handle multiple large variables', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';

      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());

      const mockChild = createMockChild('test output');
      const spawnSpy = vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "$var1 $var2"',
        {},
        undefined,
        {
          var1: 'x'.repeat(200),
          var2: 'y'.repeat(200),
          small: 'tiny'
        }
      );

      const script = mockChild._stdinChunks.join('');
      const spawnOptions = spawnSpy.mock.calls[0][2] as any;

      // Should have two heredocs
      expect(script).toContain("var1=$(cat <<'MLLD_EOF_");
      expect(script).toContain("var2=$(cat <<'MLLD_EOF_");
      // No exports for oversized vars
      expect(script).not.toContain('export var1');
      expect(script).not.toContain('export var2');

      // Small variable should be in env
      expect(spawnOptions.env.small).toBe('tiny');
    });
  });

  it('does not expand variables or command substitution inside heredoc content', async () => {
    // Force heredoc path for even small values
    process.env.MLLD_BASH_HEREDOC = '1';
    process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '8';

    const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
    const tricky = "literal $(echo hacked) $HOME `uname`";

    const out = await executor.execute('printf "%s" "$x"', {}, undefined, { x: tricky });
    expect(out).toBe(tricky);
  });

  describe('Debug Logging', () => {
    it('should log when heredocs are used in debug mode', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_DEBUG = 'true';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());

      const mockChild = createMockChild('test output');
      vi.mocked(child_process.spawn).mockReturnValue(mockChild);

      await executor.execute(
        'echo "test"',
        {},
        undefined,
        { largevar: 'x'.repeat(200) }
      );

      // Should have logged about heredoc usage
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[BashExecutor] Using heredoc for 1 oversized variable(s)')
      );
    });
  });
});
