import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunDirectiveHandler } from '../run';
import { InterpreterState } from '../../state/state';
import { createTestContext, createTestLocation } from '../../__tests__/test-utils';
import { exec } from 'child_process';
import { vi } from 'vitest';
import { promisify } from 'util';
import { pathService } from '../../../services/path-service';

// Mock child_process and util modules
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn)
}));

// Mock path module
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock({
    testRoot: '/Users/adam/dev/meld/test/_tmp',
    testHome: '/Users/adam/dev/meld/test/_tmp/home',
    testProject: '/Users/adam/dev/meld/test/_tmp/project'
  });
});

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let state: InterpreterState;
  let context: ReturnType<typeof createTestContext>;

  beforeEach(async () => {
    handler = new RunDirectiveHandler();
    state = new InterpreterState();
    context = createTestContext();
    
    // Set current file path
    state.setCurrentFilePath(await pathService.resolvePath('$PROJECTPATH/test.meld'));

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

    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('echo "test"', expect.any(Object), expect.any(Function));
    expect(state.getTextVar('stdout')).toBe('test output');
  });

  it('should handle run directives with variables', async () => {
    state.setPathVar('cmdPath', await pathService.resolvePath('$PROJECTPATH/scripts/test.sh'));
    
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: '${cmdPath}'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, context);
    const expectedPath = await pathService.resolvePath('$PROJECTPATH/scripts/test.sh');
    expect(exec).toHaveBeenCalledWith(expectedPath, expect.any(Object), expect.any(Function));
    expect(state.getTextVar('stdout')).toBe('test output');
  });

  it('should handle working directory with special variables', async () => {
    const workDir = await pathService.resolvePath('$PROJECTPATH/test/dir');
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'pwd'
      },
      location: createTestLocation(1, 1)
    };

    context.workspaceRoot = workDir;
    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('pwd', { cwd: workDir }, expect.any(Function));
  });

  it('should handle path variables in commands', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'cat $PROJECTPATH/test.txt'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('cat $PROJECTPATH/test.txt', expect.any(Object), expect.any(Function));
  });

  it('should handle home directory paths in commands', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'cat $HOMEPATH/config.txt'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('cat $HOMEPATH/config.txt', expect.any(Object), expect.any(Function));
  });

  it('should handle path aliases in commands', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'run',
        command: 'cat $./local.txt'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, context);
    expect(exec).toHaveBeenCalledWith('cat $./local.txt', expect.any(Object), expect.any(Function));
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
}); 