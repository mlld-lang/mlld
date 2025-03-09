import type { DirectiveNode } from 'meld-spec';
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { InterpreterState } from './state';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { vi } from 'vitest';
import type { MeldNode } from 'meld-spec';

/**
 * Mock handler for embed directives
 */
@injectable()
@Service('MockEmbedDirectiveHandler for testing')
export class EmbedDirectiveHandler {
  constructor() {
    // Empty constructor for DI compatibility
  }
  
  kind = 'execution';
  directiveName = 'embed';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'embed';
  }

  async transform(node: DirectiveNode, state: any): Promise<any> {
    // Mock transformation implementation
    return node;
  }

  async execute(node: DirectiveNode, state: any): Promise<any> {
    const data = node.directive;
    if (!data.path) {
      throw new MeldDirectiveError(
        'Embed path is required',
        'embed',
        node.location?.start
      );
    }
    // Mock implementation
    state.setTextVar(`embed:${data.path}`, 'Mock embedded content');
  }

  async validate(node: DirectiveNode): Promise<boolean | { valid: boolean; errors?: string[] }> {
    // Mock validation
    if (!node.directive.path) {
      return { valid: false, errors: ['Embed path is required'] };
    }
    return true;
  }
}

/**
 * Mock handler for import directives
 */
@injectable()
@Service('MockImportDirectiveHandler for testing')
export class ImportDirectiveHandler {
  constructor() {
    // Empty constructor for DI compatibility
  }
  
  kind = 'execution';
  directiveName = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'import';
  }

  async transform(node: DirectiveNode, state: any): Promise<any> {
    // Mock transformation implementation
    return node;
  }

  async execute(node: DirectiveNode, state: any): Promise<any> {
    const data = node.directive;
    if (!data.path) {
      throw new MeldDirectiveError(
        'Import path is required',
        'import',
        node.location?.start
      );
    }
    // Mock implementation
    state.setTextVar(`import:${data.path}`, 'Mock imported content');
  }

  async validate(node: DirectiveNode): Promise<boolean | { valid: boolean; errors?: string[] }> {
    // Mock validation
    if (!node.directive.path) {
      return { valid: false, errors: ['Import path is required'] };
    }
    return true;
  }
}

// Mock parser with detailed logging
export const parseMeld = vi.fn((content: string): MeldNode[] => {
  console.log('[Parser Mock] Parsing content:', {
    content,
    length: content.length,
    type: typeof content
  });

  try {
    if (typeof content !== 'string') {
      console.error('[Parser Mock] Invalid input type:', typeof content);
      throw new MeldDirectiveError('Parser input must be a string', 'parse');
    }

    // Handle basic text directive
    if (content.startsWith('@text')) {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: content.length }
        }
      };
      console.log('[Parser Mock] Created text directive node:', node);
      return [node];
    }

    // Handle basic data directive
    if (content.startsWith('@data')) {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: { key: 'value' }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: content.length }
        }
      };
      console.log('[Parser Mock] Created data directive node:', node);
      return [node];
    }

    // Handle invalid content
    console.error('[Parser Mock] Failed to parse content:', content);
    throw new MeldDirectiveError('Failed to parse content', 'parse');
  } catch (error) {
    console.error('[Parser Mock] Error during parsing:', {
      error: error instanceof Error ? error.message : String(error),
      content
    });
    throw error;
  }
});

// Export other mocks as needed
export const interpretMeld = vi.fn();
export const DirectiveRegistry = {
  findHandler: vi.fn(),
  registerHandler: vi.fn(),
  clear: vi.fn()
};

// Export singleton instances
export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 