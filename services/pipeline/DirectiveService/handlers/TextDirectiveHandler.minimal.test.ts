import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import { createTextVariable } from '@core/types';

describe('TextDirectiveHandler (Minimal)', () => {
  let handler: TextDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Initialize resolver with mock dependencies
    resolver.initialize({
      fileSystem: {
        executeCommand: vi.fn().mockResolvedValue('command output'),
        getCwd: () => '/project'
      },
      pathService: {
        resolve: (path: string, base: string) => `${base}/${path}`,
        normalize: (path: string) => path
      }
    });
    
    handler = new TextDirectiveHandler(resolver);
  });

  it('should handle simple text assignment', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      operator: '=',
      raw: {
        identifier: 'greeting'
      },
      values: {
        content: [
          { type: 'text', value: 'Hello World' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/test.meld'
    });

    expect(result.stateChanges?.variables?.greeting).toMatchObject({
      name: 'greeting',
      value: 'Hello World',
      type: 'text'
    });
  });

  it('should handle variable interpolation', async () => {
    // Set up a variable to interpolate
    state.setVariable(createTextVariable('name', 'Alice'));

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      operator: '=',
      raw: {
        identifier: 'message'
      },
      values: {
        content: [
          { type: 'text', value: 'Hello, ' },
          { type: 'variable', node: { name: 'name' } },
          { type: 'text', value: '!' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/test.meld'
    });

    expect(result.stateChanges?.variables?.message?.value).toBe('Hello, Alice!');
  });

  it('should handle append operator (+=)', async () => {
    // Set up existing variable
    state.setVariable(createTextVariable('log', 'Line 1\n'));

    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      operator: '+=',
      raw: {
        identifier: 'log'
      },
      values: {
        content: [
          { type: 'text', value: 'Line 2' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/test.meld'
    });

    expect(result.stateChanges?.variables?.log?.value).toBe('Line 1\nLine 2');
  });

  it('should handle += on non-existent variable', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      operator: '+=',
      raw: {
        identifier: 'newVar'
      },
      values: {
        content: [
          { type: 'text', value: 'First value' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/test.meld'
    });

    expect(result.stateChanges?.variables?.newVar?.value).toBe('First value');
  });

  it('should throw error for missing identifier', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      raw: {},
      values: {
        content: [{ type: 'text', value: 'content' }]
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Text directive missing identifier');
  });

  it('should throw error for missing content', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'text',
      raw: {
        identifier: 'test'
      },
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Text directive missing content');
  });
});