import { describe, it, expect, beforeAll } from 'vitest';
import { container } from '@core/di-config.new';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.new';
import { HandlerRegistry } from '@services/pipeline/DirectiveService/HandlerRegistry.new';
import { StateService } from '@services/state/StateService/StateService';
import type { DirectiveNode } from '@core/ast/types';
import { VariableType } from '@core/types';

describe('New Handlers Direct Test', () => {
  let directiveService: IDirectiveService;
  
  beforeAll(() => {
    // Get the directive service
    directiveService = container.resolve('IDirectiveService');
    
    // Register handlers
    HandlerRegistry.registerWithService(directiveService, container);
  });
  
  it('should handle text directive directly', async () => {
    const state = new StateService();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-1',
      kind: 'text',
      subtype: 'textAssignment',
      source: 'literal',
      values: {
        content: [{ type: 'Text', content: 'Hello, Direct!', nodeId: 'text-1' }]
      },
      raw: {
        identifier: 'greeting',
        content: 'Hello, Direct!'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await directiveService.handleDirective(directive, state, {
      strict: true,
      filePath: 'test.meld'
    });
    
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables?.['greeting']).toBeDefined();
    expect(result.stateChanges?.variables?.['greeting'].type).toBe(VariableType.TEXT);
    expect(result.stateChanges?.variables?.['greeting'].value).toBe('Hello, Direct!');
  });
  
  it('should process multiple directives', async () => {
    const state = new StateService();
    
    const directives: DirectiveNode[] = [
      {
        type: 'Directive',
        nodeId: 'test-1',
        kind: 'text',
        subtype: 'textAssignment',
        source: 'literal',
        values: {
          content: [{ type: 'Text', content: 'Value 1', nodeId: 'text-1' }]
        },
        raw: {
          identifier: 'var1',
          content: 'Value 1'
        },
        meta: {}
      } as DirectiveNode,
      {
        type: 'Directive',
        nodeId: 'test-2',
        kind: 'text',
        subtype: 'textAssignment',
        source: 'literal',
        values: {
          content: [{ type: 'Text', content: 'Value 2', nodeId: 'text-2' }]
        },
        raw: {
          identifier: 'var2',
          content: 'Value 2'
        },
        meta: {}
      } as DirectiveNode
    ];
    
    const resultState = await directiveService.processDirectives(directives, state, {
      strict: true,
      filePath: 'test.meld'
    });
    
    expect(resultState.getVariable('var1')).toBeDefined();
    expect(resultState.getVariable('var1')?.value).toBe('Value 1');
    expect(resultState.getVariable('var2')).toBeDefined();
    expect(resultState.getVariable('var2')?.value).toBe('Value 2');
  });
});