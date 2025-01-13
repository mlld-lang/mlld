import { describe, it, expect, beforeEach } from 'vitest';
import { RunDirectiveHandler } from '../run';
import { InterpreterState } from '../../state/state';
import { createTestContext, createTestLocation } from '../../__tests__/test-utils';
import { exec } from 'child_process';
import { vi } from 'vitest';
import { promisify } from 'util';

vi.mock('child_process');
vi.mock('util');

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let state: InterpreterState;
  const mockExec = vi.fn();

  beforeEach(() => {
    handler = new RunDirectiveHandler();
    state = new InterpreterState();
    vi.mocked(promisify).mockReturnValue(mockExec);
    mockExec.mockReset();
  });

  it('should handle run directives with command', async () => {
    mockExec.mockResolvedValue({ stdout: 'test output', stderr: '' });

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'echo "test"'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(mockExec).toHaveBeenCalledWith('echo "test"');
    expect(state.getCommand('echo "test"')).toBe('test output');
  });

  it('should handle run directives with variables', async () => {
    mockExec.mockResolvedValue({ stdout: 'variable output', stderr: '' });
    state.setDataVar('cmd', 'echo "test"');

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: '${cmd}'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(mockExec).toHaveBeenCalledWith('echo "test"');
    expect(state.getCommand('echo "test"')).toBe('variable output');
  });

  it('should throw on missing command', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('Run directive requires a command parameter');
  });

  it('should handle command errors', async () => {
    mockExec.mockRejectedValue(new Error('Command failed'));

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'invalid-command'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('Command failed');
  });

  it('should handle stderr output', async () => {
    mockExec.mockResolvedValue({ stdout: 'output', stderr: 'warning message' });

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'echo "test" >&2'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(state.getCommand('echo "test" >&2')).toBe('output');
  });

  it('should handle working directory', async () => {
    mockExec.mockResolvedValue({ stdout: 'pwd output', stderr: '' });
    state.setCurrentFilePath('/test/dir/file.meld');

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'pwd'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(mockExec).toHaveBeenCalledWith('pwd');
    expect(state.getCommand('pwd')).toBe('pwd output');
  });
}); 