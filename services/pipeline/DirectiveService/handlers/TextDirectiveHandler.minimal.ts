import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { createTextVariable } from '@core/types';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';

/**
 * TextDirectiveHandler using new minimal interfaces.
 * 
 * Handles @text directives with proper variable interpolation.
 * Supports both = and += operators.
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
    // Extract identifier from directive
    const identifier = directive.raw?.identifier;
    if (!identifier) {
      throw new MeldError('Text directive missing identifier', {
        code: 'TEXT_MISSING_IDENTIFIER',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Extract content nodes from directive
    const contentNodes = directive.values?.content;
    if (!contentNodes) {
      throw new MeldError('Text directive missing content', {
        code: 'TEXT_MISSING_CONTENT', 
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Extract operator (= or +=)
    const operator = directive.operator || '=';
    
    // Create resolution context with proper structure
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0) 
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    // Resolve the content using new minimal interface
    const resolvedValue = await this.resolution.resolve({
      value: contentNodes,
      context: resolutionContext,
      type: 'text'
    });
    
    // Handle append operator
    let finalValue = resolvedValue;
    if (operator === '+=') {
      const existingVar = state.getVariable(identifier);
      if (existingVar && existingVar.type === 'text') {
        finalValue = existingVar.value + resolvedValue;
      }
    }
    
    // Create the text variable
    const variable = createTextVariable(identifier, finalValue);
    
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