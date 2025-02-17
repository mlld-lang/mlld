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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing data directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Data directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forDataDirective(
        context.currentFilePath
      );

      // Parse JSON if needed
      let parsedValue: unknown;
      try {
        // First resolve variables in the string value
        const resolvedValue = await this.resolutionService.resolveInContext(
          value,
          resolutionContext
        );

        // Then parse as JSON if it's a string
        parsedValue = typeof resolvedValue === 'string' 
          ? JSON.parse(resolvedValue)
          : resolvedValue;

        // Finally resolve any variables in the parsed object's fields
        parsedValue = await this.resolveObjectFields(parsedValue, resolutionContext);
      } catch (error: any) {
        throw new DirectiveError(
          `Invalid JSON in data directive: ${error?.message || 'Unknown error'}`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node, cause: error instanceof Error ? error : new Error(String(error)) }
        );
      }

      // 4. Store in state
      newState.setDataVar(identifier, parsedValue);

      logger.debug('Data directive processed successfully', {
        identifier,
        value: parsedValue,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process data directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  /**
   * Recursively resolve variables in object fields
   */
  private async resolveObjectFields(
    obj: any,
    context: ResolutionContext
  ): Promise<any> {
    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.resolveObjectFields(item, context))
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Resolve key if it's a variable reference
        const resolvedKey = await this.resolutionService.resolveInContext(
          key,
          context
        );
        // Recursively resolve value
        resolved[resolvedKey] = await this.resolveObjectFields(value, context);
      }
      return resolved;
    }

    if (typeof obj === 'string') {
      return this.resolutionService.resolveInContext(obj, context);
    }

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