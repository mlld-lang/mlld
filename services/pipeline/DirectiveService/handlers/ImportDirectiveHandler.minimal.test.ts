import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';

describe('ImportDirectiveHandler (Minimal)', () => {
  let handler: ImportDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;
  let mockFileSystem: IFileSystemService;
  let mockParser: IParserService;
  let mockInterpreter: IInterpreterService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Mock file system
    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('@text greeting = "Hello"\n@data config = {"port": 3000}'),
      executeCommand: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
      stat: vi.fn(),
      getCwd: () => '/project',
      dirname: (path: string) => path.substring(0, path.lastIndexOf('/'))
    } as any;
    
    // Mock parser
    mockParser = {
      parse: vi.fn().mockReturnValue({
        nodes: [
          { type: 'directive', kind: 'text', identifier: 'greeting' },
          { type: 'directive', kind: 'data', identifier: 'config' }
        ],
        parseErrors: []
      })
    } as any;
    
    // Mock interpreter
    const mockChildState = new StateService();
    mockChildState.setVariable({ name: 'greeting', value: 'Hello', type: 'text' });
    mockChildState.setVariable({ name: 'config', value: { port: 3000 }, type: 'data' });
    
    mockInterpreter = {
      interpret: vi.fn().mockResolvedValue({
        state: mockChildState,
        output: ''
      })
    } as any;
    
    // Initialize resolver
    resolver.initialize({
      fileSystem: mockFileSystem,
      pathService: {
        resolve: (path: string, base: string) => `${base}/${path}`,
        normalize: (path: string) => path
      }
    });
    
    handler = new ImportDirectiveHandler(resolver, mockFileSystem, mockParser, mockInterpreter);
  });

  it('should import all variables', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importAll',
      source: {
        type: 'path',
        path: [
          { type: 'text', value: './config.meld' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/main.meld'
    });

    expect(mockFileSystem.readFile).toHaveBeenCalledWith('/project/config.meld');
    expect(result.stateChanges?.variables).toHaveProperty('greeting');
    expect(result.stateChanges?.variables).toHaveProperty('config');
    expect(result.stateChanges?.variables?.greeting.value).toBe('Hello');
    expect(result.stateChanges?.variables?.config.value).toEqual({ port: 3000 });
  });

  it('should import selected variables', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importSelected',
      source: {
        type: 'path',
        path: [
          { type: 'text', value: './config.meld' }
        ]
      },
      selections: ['greeting']
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/main.meld'
    });

    expect(result.stateChanges?.variables).toHaveProperty('greeting');
    expect(result.stateChanges?.variables).not.toHaveProperty('config');
  });

  it('should handle import with rename', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importSelected',
      source: {
        type: 'path',
        path: [
          { type: 'text', value: './config.meld' }
        ]
      },
      selections: ['greeting'],
      rename: 'welcomeMessage'
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/main.meld'
    });

    expect(result.stateChanges?.variables).not.toHaveProperty('greeting');
    expect(result.stateChanges?.variables).toHaveProperty('welcomeMessage');
    expect(result.stateChanges?.variables?.welcomeMessage.value).toBe('Hello');
  });

  it('should throw error for missing source', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importAll'
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Import directive missing source path');
  });

  it('should throw error for parse errors', async () => {
    mockParser.parse = vi.fn().mockReturnValue({
      nodes: [],
      parseErrors: [{ message: 'Syntax error' }]
    });

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importAll',
      source: {
        type: 'path',
        path: [{ type: 'text', value: './bad.meld' }]
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Failed to parse import file');
  });

  it('should throw error for missing variable in strict mode', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'import',
      subtype: 'importSelected',
      source: {
        type: 'path',
        path: [{ type: 'text', value: './config.meld' }]
      },
      selections: ['nonexistent']
    } as any;

    await expect(
      handler.handle(directive, state, { strict: true })
    ).rejects.toThrow('Import variable not found: nonexistent');
  });
});