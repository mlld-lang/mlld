import type { IStateService } from '@services/state/StateService/IStateService';
import type { ResolutionContext, PathResolutionContext } from '@core/types/resolution';
import type { JsonValue, Result } from '@core/types/common';
import { success, failure } from '@core/types/common';
import { VariableType } from '@core/types/variables';
import { MeldError } from '@core/errors/index';
import type { MeldVariable, TextVariable, DataVariable, IPathVariable, CommandVariable } from '@core/types/variables';
import type { MeldNode, VariableReferenceNode, TextNode, DirectiveNode, NodeType } from '@core/ast/ast/astTypes';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable } from '@core/types/guards';
import { VariableResolutionError, MeldResolutionError, PathValidationError, FieldAccessError, FieldAccessErrorDetails } from '@core/errors/index';
import { ErrorSeverity } from '@core/errors/MeldError';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { resolutionLogger as logger } from '@core/utils/logger';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index';
import { container, inject, injectable } from 'tsyringe';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import { MeldPath, PathValidationContext, PathPurpose, RawPath, NormalizedAbsoluteDirectoryPath } from '@core/types/paths';
import type { IPathService } from '@services/fs/PathService/IPathService';
import {
  Field as AstField
} from '@core/syntax/types/shared-types.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { Service } from '@core/ServiceProvider.js';

/**
 * Handles resolution of variable references based on VariableReferenceNode AST.
 */
@injectable()
@Service({
  description: 'Resolves variable references, including field access'
})
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private resolutionTracker?: VariableResolutionTracker;
  private resolutionClient?: IResolutionServiceClient;
  private resolutionClientFactory?: ResolutionServiceClientFactory;
  private parserClient?: IParserServiceClient;
  private parserClientFactory?: ParserServiceClientFactory;
  private factoryInitialized: boolean = false;
  private pathService: IPathService;

  /**
   * Creates a new instance of the VariableReferenceResolver
   * @param stateService - Refactored State service instance
   * @param pathService - Added Path service instance
   * @param resolutionService - Optional main Resolution service instance (for potential callbacks/delegation)
   * @param parserService - Optional Parser service instance (fallback/tests)
   */
  constructor(
    @inject('IStateService') private readonly stateService: IStateService,
    @inject('IPathService') pathService: IPathService,
    @inject('IResolutionService') private readonly resolutionService?: IResolutionService,
    @inject('IParserService') private readonly parserService?: IParserService
  ) {
    logger.debug('VariableReferenceResolver initialized.');
    this.pathService = pathService;
  }

  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    if (!this.resolutionService && !this.resolutionClient) {
      try {
        // Commenting out problematic global container resolve for tests
        // this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
        // this.initializeResolutionClient(); 
        logger.debug('Skipping ResolutionServiceClient factory resolution as ResolutionService was not injected.');
      } catch (error) {
        logger.warn('Failed during attempt to initialize ResolutionServiceClient', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ResolutionService, skipping client factory');
    }
    
    if (!this.parserService && !this.parserClient) {
      try {
        // Commenting out problematic global container resolve for tests
        // this.parserClientFactory = container.resolve('ParserServiceClientFactory');
        // this.initializeParserClient();
        logger.debug('Skipping ParserServiceClient factory resolution as ParserService was not injected.');
      } catch (error) {
        logger.warn('Failed during attempt to initialize ParserServiceClient', {
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
      throw new VariableResolutionError('Maximum resolution depth exceeded', {
          code: 'E_MAX_DEPTH', 
          severity: ErrorSeverity.Fatal, 
          details: { context, variableName: 'Unknown (Max Depth)' }
      });
    }
    
    const newContext = context.withIncreasedDepth();

    try {
      const variable = await this.getVariable(node, newContext);
      
      if (!variable) {
          if (!newContext.strict) {
             logger.warn(`[RESOLVE] Non-strict mode, variable '${node.identifier}' not found, returning empty string.`);
             return '';
          }
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, {
              code: 'E_VAR_NOT_FOUND',
              severity: ErrorSeverity.Recoverable, 
              details: { variableName: node.identifier, valueType: node.valueType }
          });
      }

      // --- Check for InterpolatableValue first --- 
      if (isInterpolatableValueArray(variable.value)) {
          if (!this.resolutionService) {
              throw new MeldResolutionError('Cannot recursively resolve variable: ResolutionService instance is missing.', {
                  code: 'E_SERVICE_UNAVAILABLE', 
                  details: { variableName: node.identifier }
              });
          }
          logger.debug(`Variable '${node.identifier}' contains an InterpolatableValue array. Performing recursive resolution.`);
          return await this.resolutionService.resolveNodes(variable.value, newContext);
      }

      // --- Path Variable Handling --- 
      if (isPathVariable(variable)) {
          logger.debug(`Resolving PathVariable '${node.identifier}'`);
          const meldPathValueState = variable.value; // This is IFilesystemPathState or IUrlPathState
          
          // Revert to returning originalValue. Validation/resolution should happen when path is used.
          return meldPathValueState.originalValue; 
      }
      
      // --- Command Variable Handling ---
      else if (isCommandVariable(variable)) {
          logger.debug(`Resolving CommandVariable '${node.identifier}'`);
          // Return a string representation (e.g., JSON) as commands aren't directly substituted as strings.
          // The @run handler deals with the definition object.
          try {
              return JSON.stringify(variable.value);
          } catch (e) {
              logger.error(`Error stringifying command definition for ${node.identifier}`, { error: e });
              if (newContext.strict) {
                  throw new MeldResolutionError(`Could not stringify command definition for ${node.identifier}`, {
                      code: 'E_STRINGIFY_FAILED',
                      cause: e
                  });
              }
              return '';
          }
      }
      
      // --- Text/Data Variable Handling ---
      else if (isTextVariable(variable) || isDataVariable(variable)) {
          let baseValue: JsonValue | string | undefined = variable.value;
          let finalResolvedValue: JsonValue | string | undefined;
          
          if (node.fields && node.fields.length > 0) {
             // Ensure field access is only attempted on data variables (or potentially objects from text vars)
             if (typeof baseValue === 'object' && baseValue !== null) {
                  const fieldAccessResult = await this.accessFields(baseValue as JsonValue, node.fields, node.identifier, newContext);
                  logger.debug(`[resolve Field Access Result] Identifier: ${node.identifier}, Success: ${fieldAccessResult.success}, Result: ${JSON.stringify(fieldAccessResult)}`);
                  if (fieldAccessResult.success) {
                      finalResolvedValue = fieldAccessResult.value;
                  } else {
                      // accessFields returned failure(FieldAccessError)
                      if (newContext.strict) {
                          throw fieldAccessResult.error; // Throw the FieldAccessError
                      }
                      finalResolvedValue = undefined; // Non-strict, treat as undefined
                  }
             } else {
                  // Tried to access fields on a non-object (e.g., primitive string from TextVariable)
                  if (newContext.strict) {
                      const errorMsg = `Cannot access fields on non-object variable '${node.identifier}'`;
                      throw new FieldAccessError(errorMsg, { 
                         baseValue: baseValue, 
                         fieldAccessChain: node.fields, 
                         failedAtIndex: 0, 
                         failedKey: node.fields[0]?.value ?? 'unknown' 
                      });
                  }
                  finalResolvedValue = undefined; // Non-strict
             }
          } else {
              finalResolvedValue = baseValue; // Use the direct value if no fields
          }
          
          // Convert the final resolved value (which might be primitive, object, array) to a string
          return this.convertToString(finalResolvedValue, newContext);

      } else {
           // Should not be reached if type guards are exhaustive
           throw new VariableResolutionError(`Unexpected variable type encountered for ${node.identifier}`, {
              code: 'E_UNEXPECTED_TYPE', 
              details: { variableName: node.identifier }
           });
      }

    } catch (error) {
        logger.warn(`[RESOLVE CATCH] Error resolving ${node.identifier}:`, { error });
        
        // Always re-throw FieldAccessErrors if strict mode was enabled during accessFields call
        if (error instanceof FieldAccessError && newContext.strict) {
            throw error;
        }
        
        if (newContext.strict) {
            // Ensure other errors are MeldErrors or wrapped
            if (error instanceof MeldError) {
                throw error;
            } else {
                 // <<< Include node and context in details >>>
                 throw new MeldResolutionError(`Failed to resolve variable ${node.identifier}`, {
                     code: 'E_RESOLVE_FAILED', // Generic code
                     cause: error instanceof Error ? error : undefined,
                     details: { 
                         variableName: node.identifier,
                         node: node,       // Add original node
                         context: context  // Add original context
                     }
                 });
            }
        }
        
        // Non-strict mode: Check for fatal errors that shouldn't be suppressed
        if (error instanceof MeldError && error.severity === ErrorSeverity.Fatal) { 
             logger.error(`[RESOLVE] Throwing non-suppressed fatal error for ${node.identifier} in non-strict mode`, { error });
             throw error;
        }
        
        // <<< Check if we should return the original tag >>>
        if (context.flags?.preserveUnresolved) { // Check for a flag (needs adding to ResolutionContext)
            logger.warn(`[RESOLVE] Non-strict mode & preserveUnresolved=true, returning original tag for ${node.identifier}.`);
            // Reconstruct the tag - this might need refinement based on AST details
            let tag = `{{${node.identifier}}}`; 
            if (node.fields && node.fields.length > 0) {
                // @ts-ignore was here - removed as type inference now works
                tag = `{{${node.identifier}${node.fields.map((f) => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('')}}}`; 
            }
            return tag;
        }

        // Suppress non-fatal errors in non-strict mode and return empty string
        logger.warn(`[RESOLVE] Non-strict mode, suppressing error for ${node.identifier}, returning empty string.`);
        return '';
    }
  }
  
  /**
   * Gets a variable from state, using the node's valueType for targeted lookup.
   */
  private async getVariable(node: VariableReferenceNode, context: ResolutionContext): Promise<MeldVariable | undefined> {
    const name = node.identifier;
    const specificType = node.valueType;

    this.resolutionTracker?.trackAttemptStart(name, `getVariable (type hint: ${specificType ?? 'any'})`);
    
    // Always use the generic getVariable from state service
    const variable: MeldVariable | undefined = await this.stateService.getVariable(name); 

    if (variable) {
        // If a specific type hint was provided, validate the found variable's type
        if (specificType && variable.type !== specificType) {
            logger.warn(`Variable '${name}' found, but type mismatch. Expected ${specificType}, got ${variable.type}.`);
            this.resolutionTracker?.trackResolutionAttempt(name, `variable-type-mismatch`, false);
            return undefined; // Treat as not found if type doesn't match hint
        }
        // <<< Add check for allowed variable types >>>
        logger.debug(`[getVariable Check Allowed] Variable: ${JSON.stringify(variable)}, Allowed: ${JSON.stringify(context.allowedVariableTypes)}`);
        if (context.allowedVariableTypes && !context.allowedVariableTypes.includes(variable.type)) {
            logger.warn(`Variable '${name}' found, but type ${variable.type} is not allowed in this context.`);
            this.resolutionTracker?.trackResolutionAttempt(name, `variable-type-disallowed`, false);
            // Throw error here, as validateResolution expects a throw in strict mode
            throw new VariableResolutionError(
                `Variable type '${variable.type}' for '${name}' is not allowed in this context.`,
                {
                    code: 'E_VAR_TYPE_DISALLOWED',
                    details: { 
                        variableName: name, 
                        foundType: variable.type, 
                        allowedTypes: context.allowedVariableTypes 
                    }
                }
            );
        }
        // Type matches hint (or no hint was given)
        this.resolutionTracker?.trackResolutionAttempt(name, `${variable.type}-variable`, true, variable.value);
        logger.debug(`Found ${variable.type} variable '${name}'.`);
        return variable;
    } else {
        // Variable not found by generic getter
        logger.warn(`Variable '${name}'${specificType ? ' (hinted type: ' + specificType + ')' : ''} not found in state.`);
        this.resolutionTracker?.trackResolutionAttempt(name, `variable-not-found (type hint: ${specificType ?? 'any'})`, false);
        return undefined;
    }
  }

  /**
   * Access fields on a value based on an AST Field array.
   */
  public async accessFields(
    baseValue: JsonValue, 
    fields: AstField[],
    variableName: string,
    context: ResolutionContext
  ): Promise<Result<JsonValue | undefined, FieldAccessError>> { // <<< Explicit error type
    let current: JsonValue | undefined = baseValue;
    logger.debug(`[ACCESS FIELDS ENTRY] Starting accessFields`, { baseValue: JSON.stringify(baseValue), fields: JSON.stringify(fields), variableName });

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('');
      logger.debug(`[ACCESS FIELDS] Accessing field: ${currentPathString}`, { currentValueType: typeof current });

      try { // Wrap potential runtime errors
          if (current === undefined || current === null) {
             const errorMsg = `Cannot access field '${field.value}' on null or undefined value at path ${currentPathString}`;
             const errorDetails: FieldAccessErrorDetails = { baseValue, fieldAccessChain: fields, failedAtIndex: i, failedKey: field.value };
             return failure(new FieldAccessError(errorMsg, errorDetails));
          }
    
          if (field.type === 'field') { 
            const key = String(field.value);
            if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
              if (Object.prototype.hasOwnProperty.call(current, key)) {
                current = (current as Record<string, JsonValue>)[key];
              } else {
                const availableKeys = Object.keys(current).join(', ') || '(none)';
                const errorMsg = `Field '${key}' not found in object. Available keys: ${availableKeys}`;
                const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: key };
                return failure(new FieldAccessError(errorMsg, errorDetails));
              }
            } else {
              const errorMsg = `Cannot access property '${key}' on non-object value (type: ${typeof current})`;
              const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: key };
              return failure(new FieldAccessError(errorMsg, errorDetails));
            }
          } else if (field.type === 'index') {
            const index = Number(field.value);
            if (isNaN(index) || !Number.isInteger(index)) {
                const errorMsg = `Invalid array index '${field.value}'`;
                const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: field.value };
                return failure(new FieldAccessError(errorMsg, errorDetails));
            }
            if (Array.isArray(current)) {
              if (index >= 0 && index < current.length) {
                current = current[index];
              } else {
                const errorMsg = `Index '${index}' out of bounds for array of length ${current.length}`;
                const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: index };
                return failure(new FieldAccessError(errorMsg, errorDetails));
              }
            } else {
              const errorMsg = `Cannot access index '${index}' on non-array value (type: ${typeof current})`;
              const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: index };
              return failure(new FieldAccessError(errorMsg, errorDetails));
            }
          } else {
              const unknownType = (field as any).type;
              const errorMsg = `Unknown field access type: '${unknownType}'`;
              const errorDetails: FieldAccessErrorDetails = { baseValue: current, fieldAccessChain: fields, failedAtIndex: i, failedKey: 'unknown' };
              return failure(new FieldAccessError(errorMsg, errorDetails));
          }
      } catch (internalError) { 
          logger.error(`[ACCESS FIELDS] Unexpected internal error during field access`, { variableName, field: field, currentPathString, internalError });
          const errorMsg = `Internal error accessing field '${field.value}'`;
          const errorDetails: FieldAccessErrorDetails = { baseValue, fieldAccessChain: fields, failedAtIndex: i, failedKey: field.value };
          return failure(new FieldAccessError(errorMsg, errorDetails, internalError instanceof Error ? internalError : undefined));
      }
    }
    logger.debug(`[ACCESS FIELDS EXIT] Completed successfully. Final value: ${JSON.stringify(current)}`);
    return success(current);
  }

  /**
   * Converts a resolved value to its string representation for final output/use.
   */
  private convertToString(value: JsonValue | string | undefined, context: ResolutionContext): string {
      if (value === undefined || value === null) {
          // Use strict mode to determine if null/undefined become empty string or throw?
          // For now, standard behavior is empty string.
          return '';
      }
      if (typeof value === 'string') {
          return value;
      }
      // For non-string JSON values (number, boolean, object, array), stringify.
      try {
          // Consider formatting context if available (e.g., indentation for objects/arrays)
          const indent = context.formattingContext?.indentationLevel;
          return JSON.stringify(value, null, indent);
      } catch (e) {
          logger.error('Error stringifying value for conversion', { error: e });
          // Fallback for complex objects that might fail stringify (e.g., circular refs not caught earlier)
          if (context.strict) {
               throw new MeldResolutionError('Could not stringify resolved value', {
                   code: 'E_STRINGIFY_FAILED',
                   cause: e instanceof Error ? e : undefined
               });
          }
          return '[Unstringifiable Value]'; 
      }
  }
}
