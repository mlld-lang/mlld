import { DirectiveNode, DirectiveData } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

interface DataDirective extends DirectiveData {
  kind: 'data';
  identifier: string;
  value: any;
}

/**
 * Handler for @data directives
 * Stores structured data in state after resolving variables and validating schema
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract directive details
      const directive = node.directive as DataDirective;
      const { identifier, value } = directive;

      // Handle empty or undefined value
      if (value === undefined || value === null) {
        throw new DirectiveError(
          'Data directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // 3. Create resolution context
      const resolutionContext = ResolutionContextFactory.forDataDirective(
        context.currentFilePath
      );

      // 4. Convert value to string if it's not already
      const stringValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);

      // 5. Resolve any variables in the string
      const resolvedString = await this.resolutionService.resolveInContext(
        stringValue,
        resolutionContext
      );

      // 6. Parse the resolved string
      let resolvedValue: any;
      try {
        if (resolvedString === 'true') {
          resolvedValue = true;
        } else if (resolvedString === 'false') {
          resolvedValue = false;
        } else if (resolvedString === 'null') {
          resolvedValue = null;
        } else if (/^-?\d+(\.\d+)?$/.test(resolvedString)) {
          resolvedValue = Number(resolvedString);
        } else {
          // Try to parse as JSON first
          try {
            resolvedValue = JSON.parse(resolvedString);
          } catch (parseError) {
            // If it's a simple string, wrap it in quotes to make it valid JSON
            if (!resolvedString.startsWith('{') && !resolvedString.startsWith('[') && !resolvedString.includes(' ')) {
              try {
                resolvedValue = JSON.parse(`"${resolvedString}"`);
              } catch (stringParseError) {
                // If even quoted string parsing fails, propagate the original error
                logger.error('Invalid JSON format', {
                  value: resolvedString,
                  error: parseError,
                  location: node.location
                });
                throw parseError;
              }
            } else {
              // For invalid JSON objects/arrays, propagate the error
              logger.error('Invalid JSON format', {
                value: resolvedString,
                error: parseError,
                location: node.location
              });
              throw parseError;
            }
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw error;
        }
        throw new DirectiveError(
          'Invalid data value format',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node, cause: error instanceof Error ? error : undefined }
        );
      }

      // 7. Store in state
      await this.stateService.setDataVar(identifier, resolvedValue);

      logger.debug('Data directive processed successfully', {
        identifier,
        valueType: typeof resolvedValue,
        value: resolvedValue,
        location: node.location
      });
    } catch (error: unknown) {
      logger.error('Failed to process data directive', {
        location: node.location,
        error
      });

      // Propagate SyntaxError directly
      if (error instanceof SyntaxError) {
        throw error;
      }
   
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in data directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined
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