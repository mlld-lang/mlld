import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddDirectiveHandler } from './AddDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { createTextVariable, createDataVariable, createPathVariable } from '@core/types';

describe('AddDirectiveHandler (Minimal)', () => {
  let handler: AddDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;
  let mockFileSystem: IFileSystemService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Mock file system
    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('File content'),
      executeCommand: vi.fn(),
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
    
    handler = new AddDirectiveHandler(resolver, mockFileSystem);
  });

  it('should handle variable reference', async () => {
    state.setVariable(createTextVariable('message', 'Hello World!'));

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addVariable',
      raw: {
        variable: '@message'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.nodes).toHaveLength(1);
    expect(result.stateChanges?.nodes?.[0]).toMatchObject({
      type: 'content',
      content: 'Hello World!'
    });
  });

  it('should handle data variable as JSON', async () => {
    state.setVariable(createDataVariable('config', { port: 3000, host: 'localhost' }));

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addVariable',
      raw: {
        variable: 'config'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    const content = result.stateChanges?.nodes?.[0]?.content;
    expect(content).toContain('"port": 3000');
    expect(content).toContain('"host": "localhost"');
  });

  it('should handle path directive', async () => {
    mockFileSystem.readFile = vi.fn().mockResolvedValue('Template content');
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addPath',
      values: {
        path: [
          { type: 'text', value: './templates/header.md' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/src/main.meld'
    });

    expect(mockFileSystem.readFile).toHaveBeenCalledWith('/project/src/templates/header.md');
    expect(result.stateChanges?.nodes?.[0]?.content).toBe('Template content');
  });

  it('should handle section extraction', async () => {
    const markdownContent = `
# Title

Some intro

## Installation

Run npm install

## Usage

Import the module
`;
    mockFileSystem.readFile = vi.fn().mockResolvedValue(markdownContent);
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addPathSection',
      raw: {
        section: 'Installation'
      },
      values: {
        path: [
          { type: 'text', value: './README.md' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.nodes?.[0]?.content).toBe('Run npm install');
  });

  it('should handle template with interpolation', async () => {
    state.setVariable(createTextVariable('name', 'Alice'));
    state.setVariable(createTextVariable('role', 'Developer'));
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addTemplate',
      values: {
        template: [
          { type: 'text', value: 'Welcome ' },
          { type: 'variable', node: { name: 'name' } },
          { type: 'text', value: ', our new ' },
          { type: 'variable', node: { name: 'role' } },
          { type: 'text', value: '!' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.nodes?.[0]?.content).toBe('Welcome Alice, our new Developer!');
  });

  it('should throw error for missing variable', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addVariable',
      raw: {
        variable: '@nonexistent'
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Variable not found: nonexistent');
  });

  it('should throw error for missing path', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'add',
      subtype: 'addPath',
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Add path directive missing path');
  });
});