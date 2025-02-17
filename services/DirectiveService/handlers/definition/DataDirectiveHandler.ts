import { DirectiveNode } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    await this.validationService.validate(node);

    const { identifier, value } = node.directive;
    const resolutionContext: ResolutionContext = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: context.currentFilePath
    };

    try {
      let parsedValue: unknown;

      // Handle both string and object values
      if (typeof value === 'string') {
        // First resolve any variables in the JSON string
        const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);

        // Then parse the JSON
        try {
          parsedValue = JSON.parse(resolvedJsonString);
        } catch (error) {
          if (error instanceof Error) {
            throw new DirectiveError(
              `Invalid JSON in data directive: ${error.message}`,
              'data',
              DirectiveErrorCode.VALIDATION_FAILED,
              { node, context }
            );
          }
          throw error;
        }
      } else {
        // Value is already an object, just use it directly
        parsedValue = value;
      }

      // Then recursively resolve any remaining variables in the parsed value
      const resolvedValue = await this.resolveObjectFields(parsedValue, resolutionContext);

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
          { node, context }
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
      if (obj.includes('${') || obj.includes('#{') || obj.includes('$') || obj.includes('`')) {
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
          { node }
        );
      }
      throw error;
    }
  }
} 