import { describe, it, expect, beforeEach } from 'vitest';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { configureDIContainer } from '@core/di-config.new';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/TextDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';

describe('Phase 4 Integration Test', () => {
  beforeEach(() => {
    container.reset();
    configureDIContainer();
  });

  it('should resolve TextDirectiveHandler with new ResolutionService', () => {
    // Get handler from container
    const handler = container.resolve(TextDirectiveHandler);
    
    expect(handler).toBeDefined();
    expect(handler.kind).toBe('text');
  });

  it('should handle text directive with variable interpolation', async () => {
    // Set up services
    const state = new StateService();
    state.setVariable({ name: 'user', value: 'Alice', type: 'text' });
    
    // Get handler from container
    const handler = container.resolve(TextDirectiveHandler);
    
    // Create directive
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      operator: '=',
      raw: {
        identifier: 'greeting'
      },
      values: {
        content: [
          { type: 'text', value: 'Hello, ' },
          { type: 'variable', node: { name: 'user' } },
          { type: 'text', value: '!' }
        ]
      }
    } as any;
    
    // Handle directive
    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/test.meld'
    });
    
    expect(result.stateChanges?.variables?.greeting?.value).toBe('Hello, Alice!');
  });
});