import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BashExecutor } from './BashExecutor';
import type { ErrorUtils } from '../ErrorUtils';
import type { VariableProvider } from './BashExecutor';
import { StreamBus } from '@interpreter/eval/pipeline/stream-bus';

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
  });
  
  describe('Heredoc Generation', () => {
    it('should use heredocs for large variables when enabled', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100'; // Very small for testing
      
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200); // Exceeds 100 bytes
      
      // Spy on spawnSync to capture the actual script
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
      await executor.execute(
        'echo "Value: $testvar"',
        {},
        undefined,
        { testvar: largeContent }
      );
      
      // Check that spawnSync was called with heredoc in the input
      expect(spawnSyncSpy).toHaveBeenCalled();
      const call = spawnSyncSpy.mock.calls[0];
      const script = call[2].input as string;
      
      // Verify heredoc structure using cat heredoc
      expect(script).toContain("testvar=$(cat <<'MLLD_EOF_");
      expect(script).toContain(largeContent);
      // Oversized vars are no longer exported; they remain local shell vars
      expect(script).not.toContain('export testvar');
      expect(script).toContain('echo "Value: $testvar"');
      
      spawnSyncSpy.mockRestore();
    });
    
    it('should not use heredocs when disabled', async () => {
      process.env.MLLD_BASH_HEREDOC = 'false';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';
      
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200);
      
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
      await executor.execute(
        'echo "Value: $testvar"',
        {},
        undefined,
        { testvar: largeContent }
      );
      
      const call = spawnSyncSpy.mock.calls[0];
      const script = call[2].input as string;
      const env = call[2].env;
      
      // Should not have heredoc in script
      expect(script).not.toContain('MLLD_EOF_');
      // Should have variable in environment
      expect(env.testvar).toBe(largeContent);
      
      spawnSyncSpy.mockRestore();
    });
    
    it('should sanitize variable names with special characters', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';
      
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      const largeContent = 'x'.repeat(200);
      
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
      await executor.execute(
        'echo "Value: $my_var_name"',
        {},
        undefined,
        { 'my-var-name': largeContent } // Note the dashes
      );
      
      const call = spawnSyncSpy.mock.calls[0];
      const script = call[2].input as string;
      
      // Should use sanitized name
      expect(script).toContain("my_var_name=$(cat <<'MLLD_EOF_");
      // No export for oversized vars; alias should map original -> sanitized
      expect(script).toContain('my-var-name="$my_var_name"');
      
      spawnSyncSpy.mockRestore();
    });
    
    it('should handle EOF marker collision', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';
      
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      
      // Content that could collide with a marker
      const largeContent = 'x'.repeat(100) + '\nMLLD_EOF_test\n' + 'y'.repeat(100);
      
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
      await executor.execute(
        'echo "Done"',
        {},
        undefined,
        { testvar: largeContent }
      );
      
      const call = spawnSyncSpy.mock.calls[0];
      const script = call[2].input as string;
      
      // Extract the actual marker used
      const markerMatch = script.match(/testvar=\$\(cat <<'(MLLD_EOF_[^']+)'/);
      expect(markerMatch).toBeTruthy();
      const marker = markerMatch![1];
      
      // The marker should not exist in the content
      expect(largeContent).not.toContain(marker);
      
      spawnSyncSpy.mockRestore();
    });
    
    it('should handle multiple large variables', async () => {
      process.env.MLLD_BASH_HEREDOC = '1';
      process.env.MLLD_MAX_BASH_ENV_VAR_SIZE = '100';
      
      const executor = new BashExecutor(mockErrorUtils, '/tmp', mockVariableProvider, () => new StreamBus());
      
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
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
      
      const call = spawnSyncSpy.mock.calls[0];
      const script = call[2].input as string;
      const env = call[2].env;
      
      // Should have two heredocs
      expect(script).toContain("var1=$(cat <<'MLLD_EOF_");
      expect(script).toContain("var2=$(cat <<'MLLD_EOF_");
      // No exports for oversized vars
      expect(script).not.toContain('export var1');
      expect(script).not.toContain('export var2');
      
      // Small variable should be in env
      expect(env.small).toBe('tiny');
      
      spawnSyncSpy.mockRestore();
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
      
      const spawnSyncSpy = vi.spyOn(require('child_process'), 'spawnSync').mockReturnValue({
        stdout: 'test output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 123,
        output: ['test output'],
        error: undefined
      });
      
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
      
      consoleErrorSpy.mockRestore();
      spawnSyncSpy.mockRestore();
    });
  });
});
