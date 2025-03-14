import { DirectiveNode, DirectiveData } from '@core/syntax/types.js';
// Define interfaces matching the meld-ast structure for data directives
interface DataDirective extends DirectiveData {
  kind: 'data';
  identifier: string;
  source: 'literal' | 'reference';
  value: any;
}

import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
@injectable()
@Service({
  description: 'Handler for @data directives'
})
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing data directive', {
      location: node.location,
      directive: node.directive
    });

    await this.validationService.validate(node);

    const { identifier, value, source } = node.directive as DataDirective;
    const resolutionContext: ResolutionContext = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: context.currentFilePath,
      state: context.state
    };

    try {
      let resolvedValue: unknown;

      // Values already come parsed from the AST - we just need to resolve any variables inside them
      if (source === 'literal') {
        // Value is already parsed by the AST, just resolve any variables it might contain
        resolvedValue = await this.resolveObjectFields(value, resolutionContext);
      } else if (source === 'reference') {
        // Handle reference source (if needed)
        // This handles cases where value is a reference to another variable
        resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
      } else {
        // Fallback for backward compatibility
        if (typeof value === 'string') {
          // Resolve any variables in the string
          const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);
          
          try {
            resolvedValue = JSON.parse(resolvedJsonString);
            resolvedValue = await this.resolveObjectFields(resolvedValue, resolutionContext);
          } catch (error) {
            if (error instanceof Error) {
              throw new DirectiveError(
                `Invalid JSON in data directive: ${error.message}`,
                'data',
                DirectiveErrorCode.VALIDATION_FAILED,
                { 
                  node, 
                  context,
                  severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
                }
              );
            }
            throw error;
          }
        } else {
          // Value is already an object, resolve variables in it
          resolvedValue = await this.resolveObjectFields(value, resolutionContext);
        }
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      newState.setDataVar(identifier, resolvedValue);
      return newState;
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Error processing data directive: ${error.message}`,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          { 
            node, 
            context,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED]
          }
        );
      }
      throw error;
    }
  }

  /**
   * Recursively resolve variables in object fields
   */
  private async resolveObjectFields(
    obj: any,
    context: ResolutionContext
  ): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // If the string contains any variable references, resolve them
      if (obj.includes('{{') || obj.includes('${') || obj.includes('$')) {
        return this.resolutionService.resolveInContext(obj, context);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.resolveObjectFields(item, context))
      );
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Keep original key, only resolve value
        resolved[key] = await this.resolveObjectFields(value, context);
      }
      return resolved;
    }

    // For other primitive types (number, boolean, etc), return as is
    return obj;
  }

  /**
   * Validate resolved value against schema
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    try {
      // TODO: Implement schema validation once schema system is defined
      // For now, just log that we would validate
      logger.debug('Schema validation requested', {
        schema,
        location: node.location
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Schema validation failed: ${error.message}`,
          'data',
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }
      throw error;
    }
  }
} 