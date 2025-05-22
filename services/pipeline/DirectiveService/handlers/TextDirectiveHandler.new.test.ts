import { describe, it, expect, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.new';
import type { DirectiveNode } from '@core/ast/types';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { StateService } from '@services/state/StateService/StateService';
import { VariableType } from '@core/types';

describe('TextDirectiveHandler (new minimal version)', () => {
  it('should process text directive and return state changes', async () => {
    // Mock resolution service
    const mockResolution: Partial<IResolutionService> = {
      resolveNodes: vi.fn().mockResolvedValue('resolved content')
    };
    
    const handler = new TextDirectiveHandler(mockResolution as IResolutionService);
    const state = new StateService();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-node',
      kind: 'text',
      subtype: 'textAssignment',
      source: 'literal',
      values: {
        content: [{ type: 'Text', content: 'hello world', nodeId: 'text-1' }]
      },
      raw: {
        identifier: 'myVar',
        content: 'hello world'
      },
      meta: {}
    } as DirectiveNode;
    
    const result = await handler.handle(directive, state, { strict: true });
    
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toBeDefined();
    expect(result.stateChanges?.variables?.['myVar']).toBeDefined();
    expect(result.stateChanges?.variables?.['myVar'].type).toBe(VariableType.TEXT);
    expect(result.stateChanges?.variables?.['myVar'].value).toBe('resolved content');
  });
  
  it('should throw error when identifier is missing', async () => {
    const mockResolution: Partial<IResolutionService> = {
      resolveNodes: vi.fn()
    };
    
    const handler = new TextDirectiveHandler(mockResolution as IResolutionService);
    const state = new StateService();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-node',
      kind: 'text',
      subtype: 'textAssignment',
      source: 'literal',
      values: {
        content: [{ type: 'Text', content: 'hello', nodeId: 'text-1' }]
      },
      raw: {
        // missing identifier
        content: 'hello'
      },
      meta: {}
    } as DirectiveNode;
    
    await expect(handler.handle(directive, state, { strict: true }))
      .rejects.toThrow('Text directive missing identifier');
  });
  
  it('should throw error when content is missing', async () => {
    const mockResolution: Partial<IResolutionService> = {
      resolveNodes: vi.fn()
    };
    
    const handler = new TextDirectiveHandler(mockResolution as IResolutionService);
    const state = new StateService();
    
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'test-node',
      kind: 'text',
      subtype: 'textAssignment',
      source: 'literal',
      values: {
        // missing content
      },
      raw: {
        identifier: 'myVar'
      },
      meta: {}
    } as DirectiveNode;
    
    await expect(handler.handle(directive, state, { strict: true }))
      .rejects.toThrow('Text directive missing content');
  });
});