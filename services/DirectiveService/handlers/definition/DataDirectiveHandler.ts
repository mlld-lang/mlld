import { DirectiveNode, DirectiveData } from '../../../../node_modules/meld-spec/dist/types';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService, ResolutionContext } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';

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
      const directive = node.directive as DirectiveData & {
        kind: 'data';
        name: string;
        value: any;
      };
      const { name, value } = directive;

      // 3. Create appropriate resolution context
      const resolutionContext = ResolutionContextFactory.forDataDirective(context.currentFilePath);

      // 4. Resolve and parse value
      let resolvedValue: any;
      
      // Handle value based on type
      const stringValue = typeof value === 'string'
        ? JSON.stringify(value)  // String values need to be stringified
        : value;  // Object/array values are already stringified by the test factory

      // Try to parse the value first to see if it's already JSON
      let valueToResolve: string;
      try {
        JSON.parse(value);
        // If it parses, it's already JSON, use as-is
        valueToResolve = value;
      } catch {
        // If it doesn't parse, it needs to be stringified
        valueToResolve = stringValue;
      }

      // Resolve any variables in the string
      const resolvedString = await this.resolutionService.resolveInContext(
        valueToResolve,
        resolutionContext
      );

      // Always try to parse as JSON
      try {
        resolvedValue = JSON.parse(resolvedString);
      } catch (error) {
        // Let SyntaxError propagate up
        throw error;
      }

      // 5. Store in state
      await this.stateService.setDataVar(name, resolvedValue);

      logger.debug('Stored data variable', {
        name,
        valueType: typeof resolvedValue,
        location: node.location
      });
    } catch (error) {
      // Only wrap non-SyntaxErrors in DirectiveError
      if (error instanceof Error && !(error instanceof SyntaxError)) {
        throw new DirectiveError(
          error.message,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          {
            node,
            context,
            cause: error
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