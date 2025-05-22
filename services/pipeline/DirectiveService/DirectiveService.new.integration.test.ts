import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container, type DependencyContainer } from 'tsyringe';
import { DirectiveService } from './DirectiveService.new';
import { HandlerRegistry } from './HandlerRegistry.new';
import { StateService } from '@services/state/StateService/StateService';
import type { DirectiveNode } from '@core/ast/types';
import { VariableType } from '@core/types';

// Mock services
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';

describe('DirectiveService with new handlers integration', () => {
  let testContainer: DependencyContainer;
  let directiveService: DirectiveService;
  
  beforeEach(() => {
    // Create child container for isolation
    testContainer = container.createChildContainer();
    
    // Register mock services
    const mockResolution: Partial<IResolutionService> = {
      resolveNodes: vi.fn().mockImplementation(async (nodes) => {
        // Simple mock - just return text content
        if (Array.isArray(nodes) && nodes[0]?.type === 'Text') {
          return nodes[0].content;
        }
        return 'resolved';
      })
    };
    
    const mockPathService: Partial<IPathService> = {
      resolvePath: vi.fn().mockImplementation((path) => `/absolute${path}`),
      exists: vi.fn().mockResolvedValue(true),
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false
      })
    };
    
    const mockFileSystem: Partial<IFileSystemService> = {
      readFile: vi.fn().mockResolvedValue('file content'),
      exists: vi.fn().mockResolvedValue(true)
    };
    
    testContainer.register('IResolutionService', { useValue: mockResolution });
    testContainer.register('IPathService', { useValue: mockPathService });
    testContainer.register('IFileSystemService', { useValue: mockFileSystem });
    testContainer.register('IParserService', { useValue: {} });
    testContainer.register('IInterpreterService', { useValue: {} });
    
    // Register handlers with test container
    HandlerRegistry.registerWithContainer(testContainer);
    
    // Create directive service
    directiveService = new DirectiveService();
    
    // Register handlers with service using test container
    HandlerRegistry.registerWithService(directiveService, testContainer);
  });
  
  afterEach(() => {
    testContainer.dispose();
  });
  
  it('should handle text directive', async () => {
    const state = new StateService();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-1',
      kind: 'text',
      subtype: 'textAssignment',
      source: 'literal',
      values: {
        content: [{ type: 'Text', content: 'Hello, World!', nodeId: 'text-1' }]
      },
      raw: {
        identifier: 'greeting',
        content: 'Hello, World!'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await directiveService.handleDirective(directive, state, { strict: true });
    
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.['greeting']).toBeDefined();
    expect(result.stateChanges?.variables?.['greeting'].type).toBe(VariableType.TEXT);
    expect(result.stateChanges?.variables?.['greeting'].value).toBe('Hello, World!');
  });
  
  it('should handle data directive', async () => {
    const state = new StateService();
    const mockResolution = testContainer.resolve('IResolutionService') as any;
    mockResolution.resolveNodes.mockResolvedValueOnce('{"name": "John", "age": 30}');
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-2',
      kind: 'data',
      subtype: 'dataObject',
      source: 'literal',
      values: {
        content: [{ type: 'Text', content: '{"name": "John", "age": 30}', nodeId: 'text-2' }]
      },
      raw: {
        identifier: 'person',
        content: '{"name": "John", "age": 30}'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await directiveService.handleDirective(directive, state, { strict: true });
    
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.['person']).toBeDefined();
    expect(result.stateChanges?.variables?.['person'].type).toBe(VariableType.DATA);
    expect(result.stateChanges?.variables?.['person'].value).toEqual({ name: 'John', age: 30 });
  });
  
  it('should handle path directive', async () => {
    const state = new StateService();
    const mockResolution = testContainer.resolve('IResolutionService') as any;
    mockResolution.resolveNodes.mockResolvedValueOnce('/test/file.txt');
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-3',
      kind: 'path',
      subtype: 'pathAssignment',
      source: 'literal',
      values: {
        path: [{ type: 'Text', content: '/test/file.txt', nodeId: 'text-3' }]
      },
      raw: {
        identifier: 'testFile',
        path: '/test/file.txt'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await directiveService.handleDirective(directive, state, { strict: true });
    
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.['testFile']).toBeDefined();
    expect(result.stateChanges?.variables?.['testFile'].type).toBe(VariableType.PATH);
    const pathVar = result.stateChanges?.variables?.['testFile'];
    expect(pathVar.value.resolvedPath).toBe('/absolute/test/file.txt');
    expect(pathVar.value.exists).toBe(true);
  });
  
  it('should handle add directive with variable reference', async () => {
    const state = new StateService();
    // Add a variable to state first
    state.setVariable({
      name: 'content',
      type: VariableType.TEXT,
      value: 'This is the content',
      metadata: {}
    });
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-4',
      kind: 'add',
      subtype: 'addVariable',
      source: 'variable',
      values: {
        variable: [{ type: 'VariableReference', identifier: 'content', nodeId: 'var-1' }]
      },
      raw: {
        variable: '@content'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await directiveService.handleDirective(directive, state, { strict: true });
    
    expect(result.replacement).toBeDefined();
    expect(result.replacement).toHaveLength(1);
    expect(result.replacement?.[0].type).toBe('Text');
    expect((result.replacement?.[0] as any).content).toBe('This is the content');
  });
  
  it('should process multiple directives in sequence', async () => {
    const state = new StateService();
    
    const directives: DirectiveNode[] = [
      {
        type: 'Directive',
        nodeId: 'test-5',
        kind: 'text',
        subtype: 'textAssignment',
        source: 'literal',
        values: {
          content: [{ type: 'Text', content: 'First', nodeId: 'text-5' }]
        },
        raw: {
          identifier: 'var1',
          content: 'First'
        },
        meta: {}
      } as DirectiveNode,
      {
        type: 'Directive',
        nodeId: 'test-6',
        kind: 'text',
        subtype: 'textAssignment',
        source: 'literal',
        values: {
          content: [{ type: 'Text', content: 'Second', nodeId: 'text-6' }]
        },
        raw: {
          identifier: 'var2',
          content: 'Second'
        },
        meta: {}
      } as DirectiveNode
    ];
    
    const resultState = await directiveService.processDirectives(directives, state, { strict: true });
    
    expect(resultState.getVariable('var1')).toBeDefined();
    expect(resultState.getVariable('var1')?.value).toBe('First');
    expect(resultState.getVariable('var2')).toBeDefined();
    expect(resultState.getVariable('var2')?.value).toBe('Second');
  });
});