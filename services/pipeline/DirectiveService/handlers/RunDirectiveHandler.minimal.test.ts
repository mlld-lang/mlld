import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { createCommandVariable } from '@core/types';

describe('RunDirectiveHandler (Minimal)', () => {
  let handler: RunDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;
  let mockFileSystem: IFileSystemService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Mock file system
    mockFileSystem = {
      executeCommand: vi.fn().mockResolvedValue('command output'),
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
    
    handler = new RunDirectiveHandler(resolver, mockFileSystem);
  });

  it('should handle inline command execution', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runCommand',
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
    expect(result.stateChanges).toEqual({});
  });

  it('should handle inline code execution', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runCode',
      values: {
        code: 'npm install && npm test'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'npm install && npm test',
      { cwd: process.cwd() }
    );
    expect(result.stateChanges).toEqual({});
  });

  it('should handle command variable reference', async () => {
    // Set up a command variable
    state.setVariable(createCommandVariable('build', 'npm run build'));

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runExec',
      raw: {
        identifier: 'build'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
      'npm run build',
      { cwd: process.cwd() }
    );
    expect(result.stateChanges).toEqual({});
  });

  it('should throw error for missing command', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runCommand',
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Run command directive missing command');
  });

  it('should throw error for missing code', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runCode',
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Run code directive missing code');
  });

  it('should throw error for missing command variable', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'run',
      subtype: 'runExec',
      raw: {
        identifier: 'nonexistent'
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Command variable not found: nonexistent');
  });
});