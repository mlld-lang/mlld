import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunDirectiveHandler } from '../run';
import { InterpreterState } from '../../state/state';
import { createTestContext, createTestLocation } from '../../__tests__/test-utils';
import { exec } from 'child_process';
import { vi } from 'vitest';
import { promisify } from 'util';

// Mock child_process and util modules
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn)
}));

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    handler = new RunDirectiveHandler();
    state = new InterpreterState();
    vi.mocked(exec).mockImplementation((command, options, callback) => {
      if (command === 'invalid-command') {
        callback!(new Error('Command failed'), '', '');
      } else {
        callback!(null, 'test output', '');
      }
      return {} as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle run directives with command', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'echo "test"'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(exec).toHaveBeenCalledWith('echo "test"', expect.any(Object), expect.any(Function));
    expect(state.getTextVar('stdout')).toBe('test output');
  });

  it('should handle run directives with variables', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: '${cmd}'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(exec).toHaveBeenCalledWith('${cmd}', expect.any(Object), expect.any(Function));
    expect(state.getTextVar('stdout')).toBe('test output');
  });

  it('should throw on missing command', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('Run directive requires a command');
  });

  it('should handle command errors', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'invalid-command'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('Command execution failed: Command failed');
  });

  it('should handle stderr output', async () => {
    vi.mocked(exec).mockImplementation((command, options, callback) => {
      callback!(null, 'output', 'warning message');
      return {} as any;
    });

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'echo "test" >&2'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(state.getTextVar('stdout')).toBe('output');
    expect(state.getTextVar('stderr')).toBe('warning message');
  });

  it('should handle working directory', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'pwd'
      },
      location: createTestLocation(1, 1)
    };

    const context = createTestContext();
    context.workspaceRoot = '/test/dir';

    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('pwd', { cwd: '/test/dir' }, expect.any(Function));
    expect(state.getTextVar('stdout')).toBe('test output');
  });
}); 