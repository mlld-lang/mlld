import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecDirectiveHandler } from './ExecDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { createCommandVariable } from '@core/types';

describe('ExecDirectiveHandler (Minimal)', () => {
  let handler: ExecDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;
  let mockFileSystem: IFileSystemService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Mock file system
    mockFileSystem = {
      executeCommand: vi.fn().mockResolvedValue('command output\n'),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
      stat: vi.fn(),
      getCwd: () => '/project',
      dirname: (path: string) => path.substring(0, path.lastIndexOf('/'))
    } as any;
    
    // Initialize resolver
    resolver.initialize({
      fileSystem: mockFileSystem,
      pathService: {
        resolve: (path: string, base: string) => `${base}/${path}`,
        normalize: (path: string) => path
      }
    });
    
    handler = new ExecDirectiveHandler(resolver, mockFileSystem);
  });

  it('should handle inline command and capture output', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execCommand',
      raw: {
        identifier: 'result'
      },
      values: {
        command: [
          { type: 'text', value: 'echo "Hello World"' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/test.meld'
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'echo "Hello World"',
      { cwd: '/project' }
    );
    expect(result.stateChanges?.variables?.result).toMatchObject({
      name: 'result',
      value: 'command output', // trimmed
      type: 'text'
    });
  });

  it('should handle inline code and capture output', async () => {
    mockFileSystem.executeCommand = vi.fn().mockResolvedValue('test passed\n');
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execCode',
      raw: {
        identifier: 'testResult'
      },
      values: {
        code: 'npm test -- --reporter=json'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'npm test -- --reporter=json',
      { cwd: process.cwd() }
    );
    expect(result.stateChanges?.variables?.testResult?.value).toBe('test passed');
  });

  it('should handle command variable reference', async () => {
    // Set up a command variable
    state.setVariable(createCommandVariable('listFiles', 'ls -la'));
    mockFileSystem.executeCommand = vi.fn().mockResolvedValue('file1.txt\nfile2.txt\n');

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execReference',
      raw: {
        identifier: 'files'
      },
      values: {
        identifier: [
          { identifier: 'listFiles' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'ls -la',
      { cwd: process.cwd() }
    );
    expect(result.stateChanges?.variables?.files?.value).toBe('file1.txt\nfile2.txt');
  });

  it('should handle command reference with parameters', async () => {
    // Set up a command variable
    state.setVariable(createCommandVariable('grep', 'grep'));
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execReference',
      raw: {
        identifier: 'matches'
      },
      values: {
        identifier: [
          { identifier: 'grep' }
        ],
        parameters: [
          [{ type: 'text', value: '-n' }],
          [{ type: 'text', value: 'TODO' }],
          [{ type: 'text', value: 'src/*.js' }]
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'grep -n TODO src/*.js',
      { cwd: process.cwd() }
    );
  });

  it('should throw error for missing identifier', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execCommand',
      raw: {},
      values: {
        command: [{ type: 'text', value: 'echo test' }]
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Exec directive missing identifier');
  });

  it('should throw error for missing command', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execCommand',
      raw: {
        identifier: 'result'
      },
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Exec command directive missing command');
  });

  it('should throw error for unknown command variable', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'exec',
      subtype: 'execReference',
      raw: {
        identifier: 'result'
      },
      values: {
        identifier: [
          { identifier: 'nonexistent' }
        ]
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Command variable not found: nonexistent');
  });
});