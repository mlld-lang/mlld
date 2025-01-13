import { describe, it, expect, beforeEach } from 'vitest';
import { ImportDirectiveHandler } from '../import';
import { InterpreterState } from '../../state/state';
import { createTestContext, createTestLocation } from '../../__tests__/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import { vi } from 'vitest';

vi.mock('fs', async () => {
  const actualFs = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actualFs,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('path', async () => {
  const actualPath = await vi.importActual<typeof import('path')>('path');
  return {
    ...actualPath,
    isAbsolute: vi.fn(),
    resolve: vi.fn(),
    dirname: vi.fn(),
  };
});

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let state: InterpreterState;
  const mockFiles: Record<string, string> = {
    '/test/mock.meld': '@text greeting = "Hello"',
    '/test/other.meld': '@data config = { "test": true }',
    '/test/nested/test.meld': '@text nested = "value"'
  };

  beforeEach(() => {
    handler = new ImportDirectiveHandler();
    state = new InterpreterState();
    state.setCurrentFilePath('/test/mock.meld');

    // Mock fs functions
    vi.mocked(fs.existsSync).mockImplementation((path: string) => path in mockFiles);
    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path in mockFiles) {
        return mockFiles[path];
      }
      throw new Error('File not found');
    });

    // Mock path functions
    vi.mocked(path.isAbsolute).mockReturnValue(true);
    vi.mocked(path.resolve).mockImplementation((...paths) => paths.join('/'));
    vi.mocked(path.dirname).mockImplementation(p => p.split('/').slice(0, -1).join('/'));
  });

  it('should handle import directives', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'import',
        source: '/test/other.meld'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(state.getDataVar('config')).toEqual({ test: true });
  });

  it('should handle nested imports', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'import',
        source: '/test/nested/test.meld'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(state.getText('nested')).toBe('value');
  });

  it('should throw on missing source', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'import'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('Import source is required');
  });

  it('should throw on file not found', async () => {
    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'import',
        source: '/nonexistent.meld'
      },
      location: createTestLocation(1, 1)
    };

    await expect(handler.handle(node, state, createTestContext())).rejects.toThrow('File not found');
  });

  it('should handle relative paths', async () => {
    vi.mocked(path.isAbsolute).mockReturnValue(false);
    vi.mocked(path.resolve).mockImplementation((base, rel) => {
      if (base === '/test' && rel === 'other.meld') {
        return '/test/other.meld';
      }
      return `${base}/${rel}`;
    });

    const node = {
      type: 'Directive' as const,
      directive: {
        kind: 'import',
        source: 'other.meld'
      },
      location: createTestLocation(1, 1)
    };

    await handler.handle(node, state, createTestContext());
    expect(state.getDataVar('config')).toEqual({ test: true });
  });
}); 