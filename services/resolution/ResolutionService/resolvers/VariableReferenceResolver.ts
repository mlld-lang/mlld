import type { IStateService } from '@services/state/IStateService.js';
import type { ResolutionContext, JsonValue, FieldAccessError, FieldAccess, VariableType, Result } from '@core/types';
import type { MeldVariable, TextVariable, DataVariable, IPathVariable, CommandVariable, SourceLocation } from '@core/types/variables';
import type { MeldNode, VariableReferenceNode, TextNode, DirectiveNode, NodeType } from '@core/types/ast-types';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable } from '@core/types/variables';
import { success, failure } from '@core/types';
import { FieldAccessError as CoreFieldAccessError, VariableResolutionError } from '@core/errors';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { container, inject, injectable } from 'tsyringe';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { MeldPath } from '@core/types/paths';

/**
 * Handles resolution of variable references based on VariableReferenceNode AST.
 */
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private resolutionTracker?: VariableResolutionTracker;
  private resolutionClient?: IResolutionServiceClient;
  private resolutionClientFactory?: ResolutionServiceClientFactory;
  private parserClient?: IParserServiceClient;
  private parserClientFactory?: ParserServiceClientFactory;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new instance of the VariableReferenceResolver
   * @param stateService - Refactored State service instance
   * @param resolutionService - Optional main Resolution service instance (for potential callbacks/delegation)
   * @param parserService - Optional Parser service instance (fallback/tests)
   */
  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService?: IResolutionService,
    private readonly parserService?: IParserService
  ) {
    logger.debug('VariableReferenceResolver initialized.');
  }

  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    if (!this.resolutionService && !this.resolutionClient) {
      try {
        this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
        this.initializeResolutionClient();
        logger.debug('Initialized ResolutionServiceClient via factory');
      } catch (error) {
        logger.warn('Failed to initialize ResolutionServiceClient', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ResolutionService, skipping client factory');
    }
    
    if (!this.parserService && !this.parserClient) {
      try {
        this.parserClientFactory = container.resolve('ParserServiceClientFactory');
        this.initializeParserClient();
        logger.debug('Initialized ParserServiceClient via factory');
      } catch (error) {
        logger.warn('Failed to initialize ParserServiceClient, will use regex fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ParserService, skipping client factory');
    }
  }
  
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      logger.warn('ResolutionServiceClientFactory not available, some functionality may be limited');
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      logger.debug('Successfully created ResolutionServiceClient');
    } catch (error) {
      logger.warn('Failed to create ResolutionServiceClient', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private initializeParserClient(): void {
    if (!this.parserClientFactory) {
      logger.warn('ParserServiceClientFactory not available, will use regex fallback for parsing');
      return;
    }
    
    try {
      this.parserClient = this.parserClientFactory.createClient();
      logger.debug('Successfully created ParserServiceClient');
    } catch (error) {
      logger.warn('Failed to create ParserServiceClient, will use regex fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  setTracker(tracker: VariableResolutionTracker): void {
    this.resolutionTracker = tracker;
  }

  /**
   * Resolves a variable reference node, potentially including field access.
   * 
   * @param node - The VariableReferenceNode to resolve.
   * @param context - Resolution context.
   * @returns Resolved value as a string.
   */
  async resolve(node: VariableReferenceNode, context: ResolutionContext): Promise<string> {
    const currentDepth = context.depth || 0;
    if (currentDepth > this.MAX_RESOLUTION_DEPTH) {
      throw new VariableResolutionError('Maximum resolution depth exceeded', 'MaxDepth', context);
    }
    
    const newContext = context.withIncreasedDepth();
    // let node: VariableReferenceNode | null = null; // No longer needed

    // REMOVED: Block handling raw string input
    /*
    if (typeof valueOrNode === 'string') {
        // ... removed string handling logic ...
              } else {
        node = valueOrNode;
        logger.debug(`Resolving VariableReferenceNode: ${node.identifier}`, { fields: node.fields, depth: currentDepth });
    }
    
    if (!node) {
        // Should not happen if input is VariableReferenceNode, but guard anyway
        logger.error('Resolution failed: No valid node provided.');
        return ''; // Or throw if strict? 
    }
    */
   
    logger.debug(`Resolving VariableReferenceNode: ${node.identifier}`, { fields: node.fields, depth: currentDepth });

    try {
      // Use node.valueType to fetch the specific variable type
      const variable = await this.getVariable(node, newContext); // Pass the whole node
      
      if (!variable) {
        // Handle not found based on strict mode
        if (newContext.strict) {
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, node.identifier, newContext);
        }
        return ''; // Return empty string if not found and not strict
      }

      let resolvedValue: JsonValue = variable.value; // Start with the base variable value

      // Handle field access if fields are present and variable is DataVariable
      if (node.fields && node.fields.length > 0) {
        if (isDataVariable(variable)) {
          const fieldAccessResult = await this.accessFields(variable.value, node.fields, newContext);
          if (fieldAccessResult.success) {
            resolvedValue = fieldAccessResult.value;
            } else {
            // Field access failed
            if (newContext.strict) {
              throw fieldAccessResult.error; // Throw the specific FieldAccessError
            }
            resolvedValue = ''; // Return empty string if not strict
          }
        } else {
          // Fields accessed on a non-data variable
          if (newContext.strict) {
             throw new VariableResolutionError(`Cannot access fields on non-data variable: ${node.identifier}`, node.identifier, newContext, { fieldAccessAttempted: true });
          }
          resolvedValue = ''; // Return empty string if not strict
        }
      }
      
      // Convert the final resolved value to string
      const stringValue = this.convertToString(resolvedValue, newContext);
      
      // Check for nested references *after* initial resolution and field access
      // Use the main resolution service for this to handle complex text.
      if (stringValue.includes('{{') && this.resolutionService) {
           logger.debug(`Result contains nested variables, resolving recursively: ${stringValue}`);
           // Pass the potentially modified context (increased depth)
           return await this.resolutionService.resolveText(stringValue, newContext);
      }

      logger.debug(`Resolved ${node.identifier} to: ${stringValue.substring(0,100)}`);
      return stringValue;

      } catch (error) {
      logger.error(`Error resolving variable ${node.identifier}`, { error });
      if (error instanceof FieldAccessError && !newContext.strict) {
           return ''; // Non-strict field access error results in empty string
      }
      if (newContext.strict) {
          // Re-throw original error or wrap it
          throw VariableResolutionError.fromError(error, `Failed to resolve variable: ${node.identifier}`, newContext);
      }
      return ''; // Non-strict mode: return empty string on error
    }
  }
  
  /**
   * Gets a variable from state, using the node's valueType for targeted lookup.
   * This assumes StateService is refactored to return MeldVariable types.
   * 
   * @param node The VariableReferenceNode specifying the variable to get.
   * @param context Resolution context
   * @returns The MeldVariable or undefined if not found.
   */
  private async getVariable(node: VariableReferenceNode, context: ResolutionContext): Promise<MeldVariable | undefined> {
    const name = node.identifier;
    const type = node.valueType || VariableType.TEXT; // Default to TEXT if not specified
    this.resolutionTracker?.trackAttemptStart(name, `getVariable (type: ${type})`);
    
    let variable: MeldVariable | undefined = undefined;

    // Use node.valueType for targeted lookup
    switch(type) {
        case VariableType.TEXT:
            variable = this.stateService.getTextVar(name);
            break;
        case VariableType.DATA:
            variable = this.stateService.getDataVar(name);
            break;
        case VariableType.PATH:
            variable = this.stateService.getPathVar(name);
            break;
        case VariableType.COMMAND:
            variable = this.stateService.getCommandVar(name);
            break;
        default:
            logger.warn(`Unsupported variable type specified in node: ${type}`);
            // Fall through to variable not found
    }

    if (variable) {
        this.resolutionTracker?.trackResolutionAttempt(name, `${type}-variable`, true, variable.value);
        logger.debug(`Found ${type} variable '${name}'.`);
        return variable;
    } else {
        // Variable of the specific type not found
        logger.warn(`${type.charAt(0).toUpperCase() + type.slice(1)} variable '${name}' not found in state.`);
        this.resolutionTracker?.trackResolutionAttempt(name, `variable-not-found (type: ${type})`, false);
        return undefined;
    }
    
    // REMOVED old fallback logic trying multiple types
    /*
    // Prioritize based on allowed types in context?
    const allowed = context.allowedVariableTypes || [VariableType.TEXT, VariableType.DATA, VariableType.PATH, VariableType.COMMAND];
    
    if (allowed.includes(VariableType.TEXT)) {
        variable = this.stateService.getTextVar(name);
        if (variable) { 
            this.resolutionTracker?.trackResolutionAttempt(name, 'text-variable', true, variable.value);
            return variable; 
        }
    }
    // ... other types ...

    // Not found
    logger.warn(`Variable '${name}' not found in state.`);
    this.resolutionTracker?.trackResolutionAttempt(name, 'variable-not-found', false);
    return undefined;
    */
  }

  /**
   * Accesses fields on a given JSON value.
   * 
   * @param baseValue The starting JSON value (object or array).
   * @param fields An array of FieldAccess specifying the path.
   * @param context Resolution context.
   * @returns A Result containing the final JsonValue or a FieldAccessError.
   */
  async accessFields(
      baseValue: JsonValue,
      fields: FieldAccess[],
      context: ResolutionContext
  ): Promise<Result<JsonValue, FieldAccessError>> {
      logger.debug('Accessing fields', { fields, baseValueType: typeof baseValue });
      let current: JsonValue = baseValue;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
          const currentPath = fields.slice(0, i + 1);

          if (current === null || typeof current !== 'object') {
              const error = new FieldAccessError(
                  `Cannot access field '${field.key}' on non-object value: ${typeof current}`,
                  baseValue, fields, i
              );
              return failure(error);
          }

          if (field.type === FieldAccessType.PROPERTY) {
              if (!Array.isArray(current)) {
                  if (Object.prototype.hasOwnProperty.call(current, field.key)) {
                      current = (current as Record<string, JsonValue>)[field.key];
                  } else {
                      const error = new FieldAccessError(
                          `Field '${field.key}' not found in object.`,
                          baseValue, fields, i
                      );
                      return failure(error);
                  }
              } else {
                   const error = new FieldAccessError(
                      `Cannot access property '${field.key}' on an array.`,
                      baseValue, fields, i
                  );
                  return failure(error);
              }
          } else if (field.type === FieldAccessType.INDEX) {
              if (Array.isArray(current)) {
                  const index = Number(field.key);
                  if (Number.isInteger(index) && index >= 0 && index < current.length) {
        current = current[index];
      } else {
                       const error = new FieldAccessError(
                          `Index '${field.key}' out of bounds for array of length ${current.length}.`,
                          baseValue, fields, i
                      );
                      return failure(error);
                  }
          } else {
                   const error = new FieldAccessError(
                      `Cannot access index '${field.key}' on non-array value.`,
                      baseValue, fields, i
                  );
                  return failure(error);
              }
          }
      }
      
      logger.debug('Field access successful', { finalValueType: typeof current });
      return success(current);
  }

  /**
   * Converts a resolved value to its string representation based on context.
   * 
   * @param value The JsonValue to convert.
   * @param context Resolution context containing formatting preferences.
   * @returns String representation.
   */
  convertToString(value: JsonValue | undefined, context: ResolutionContext): string {
      if (value === undefined || value === null) {
          return '';
      }
      if (typeof value === 'string') {
          return value;
      }
      // TODO: Implement sophisticated formatting based on context.formattingContext
      // For now, simple JSON.stringify
      try {
          // Basic pretty printing if it's an object/array and block context indicated
          const indent = context.formattingContext?.isBlock ? 2 : undefined;
          return JSON.stringify(value, null, indent);
      } catch (e) {
          logger.error('Error stringifying value for conversion', { e });
          return String(value); // Fallback
      }
  }
}
