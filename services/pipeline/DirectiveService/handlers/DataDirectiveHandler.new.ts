import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { createDataVariable } from '@core/types';
import { injectable, inject } from 'tsyringe';

/**
 * Minimal DataDirectiveHandler implementation.
 * 
 * Processes @data directives and returns state changes.
 * Handles JSON data parsing and variable creation.
 */
@injectable()
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';
  
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
    const identifier = directive.raw.identifier;
    if (!identifier) {
      throw new Error('Data directive missing identifier');
    }
    
    // Get data value from directive - it's already parsed by the AST
    const dataValue = directive.values.value;
    if (!dataValue) {
      throw new Error('Data directive missing data value');
    }
    
    // Create the data variable
    const variable = createDataVariable(identifier, dataValue);
    
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