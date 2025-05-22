import { describe, it, expect, vi } from 'vitest';
import { DirectiveService } from './DirectiveService.new';
import { StateServiceAdapter } from '@services/state/StateService/StateServiceAdapter';
import { createTextVariable, VariableType } from '@core/types';
import type { DirectiveNode } from '@core/ast/types';
import type { IDirectiveHandler } from './IDirectiveService.new';

describe('Minimal DirectiveService', () => {
  it('should route directives to handlers', async () => {
    const service = new DirectiveService();
    const state = new StateServiceAdapter();
    
    // Create a mock handler
    const mockHandler: IDirectiveHandler = {
      kind: 'test',
      handle: vi.fn().mockResolvedValue({
        stateChanges: {
          variables: [createTextVariable('result', 'test value')]
        }
      })
    };
    
    service.registerHandler(mockHandler);
    
    // Create a test directive
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-123',
      kind: 'test',
      subtype: 'testSubtype',
      values: {},
      raw: {},
      meta: {}
    };
    
    // Handle the directive
    const result = await service.handleDirective(directive, state, {
      strict: true,
      filePath: '/test.mld'
    });
    
    expect(mockHandler.handle).toHaveBeenCalledWith(
      directive,
      state,
      { strict: true, filePath: '/test.mld' }
    );
    expect(result.stateChanges?.variables?.[0].name).toBe('result');
  });
  
  it('should process multiple directives and accumulate state', async () => {
    const service = new DirectiveService();
    const initialState = new StateServiceAdapter();
    
    // Create handlers that set different variables
    const handler1: IDirectiveHandler = {
      kind: 'set1',
      handle: vi.fn().mockResolvedValue({
        stateChanges: {
          variables: [createTextVariable('var1', 'value1')]
        }
      })
    };
    
    const handler2: IDirectiveHandler = {
      kind: 'set2',
      handle: vi.fn().mockResolvedValue({
        stateChanges: {
          variables: [createTextVariable('var2', 'value2')]
        }
      })
    };
    
    service.registerHandler(handler1);
    service.registerHandler(handler2);
    
    // Create directives
    const directives: DirectiveNode[] = [
      {
        type: 'Directive',
        nodeId: 'dir1',
        kind: 'set1',
        subtype: 'test',
        values: {},
        raw: {},
        meta: {}
      },
      {
        type: 'Directive',
        nodeId: 'dir2',
        kind: 'set2',
        subtype: 'test',
        values: {},
        raw: {},
        meta: {}
      }
    ];
    
    // Process directives
    const finalState = await service.processDirectives(directives, initialState, {
      strict: true
    });
    
    // Check that both variables are in final state
    expect(finalState.getVariable('var1')?.value).toBe('value1');
    expect(finalState.getVariable('var2')?.value).toBe('value2');
  });
  
  it('should throw error for unregistered handler', async () => {
    const service = new DirectiveService();
    const state = new StateServiceAdapter();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-123',
      kind: 'unknown',
      subtype: 'test',
      values: {},
      raw: {},
      meta: {}
    };
    
    await expect(
      service.handleDirective(directive, state, { strict: true })
    ).rejects.toThrow('No handler registered for directive kind: unknown');
  });
});