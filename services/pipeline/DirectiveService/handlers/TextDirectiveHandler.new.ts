import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { createTextVariable } from '@core/types';
import { injectable, inject } from 'tsyringe';

/**
 * Minimal TextDirectiveHandler implementation.
 * 
 * Processes @text directives and returns state changes.
 * All complexity removed - just resolves content and creates variables.
 */
@injectable()
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    // Extract identifier and content from directive
    const identifier = directive.raw.identifier;
    if (!identifier) {
      throw new Error('Text directive missing identifier');
    }
    
    // Get content nodes
    const contentNodes = directive.values.content;
    if (!contentNodes) {
      throw new Error('Text directive missing content');
    }
    
    // Create simple resolution context
    const resolutionContext = {
      state: state,
      strict: options.strict,
      currentPath: options.filePath,
      depth: 0,
      flags: {},
      withIncreasedDepth: function() { return { ...this, depth: this.depth + 1 }; },
      withStrictMode: function(strict: boolean) { return { ...this, strict }; }
    };
    
    // Resolve the content
    const resolvedValue = await this.resolution.resolveNodes(
      contentNodes,
      resolutionContext
    );
    
    // Create the text variable
    const variable = createTextVariable(identifier, resolvedValue);
    
    // Return state changes
    return {
      stateChanges: {
        variables: {
          [identifier]: variable
        }
      }
    };
  }
}