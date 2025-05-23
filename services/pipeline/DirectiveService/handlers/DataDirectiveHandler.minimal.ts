import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import { createDataVariable } from '@core/types';
import { injectable } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';

/**
 * DataDirectiveHandler using new minimal interfaces.
 * 
 * Handles @data directives - the simplest handler since data
 * is already parsed by the AST and needs no resolution.
 */
@injectable()
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';
  
  // No dependencies needed - data is already in the AST
  
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
      throw new MeldError('Data directive missing identifier', {
        code: 'DATA_MISSING_IDENTIFIER',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Get data value from directive - it's already parsed by the AST!
    const dataValue = directive.values?.value;
    if (dataValue === undefined) {
      throw new MeldError('Data directive missing data value', {
        code: 'DATA_MISSING_VALUE',
        severity: ErrorSeverity.Fatal
      });
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