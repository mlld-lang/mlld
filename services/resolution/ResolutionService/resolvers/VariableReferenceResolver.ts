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
    // process.stdout.write(`DEBUG: [VarRefResolver.setTracker] Called. Tracker instance received: ${tracker ? 'exists' : 'null'}\n`);
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
    // process.stdout.write(`DEBUG: [VRefResolver.resolve ENTRY] NodeId: ${node.nodeId}, Resolving: ${node.identifier}, ValueType: ${node.valueType}, Fields: ${node.fields?.length ?? 0}, Strict: ${context.strict}, Depth: ${currentDepth}, State ID: ${context.state?.getStateId() ?? 'N/A'}\n`);
    if (currentDepth > this.MAX_RESOLUTION_DEPTH) {
      throw new VariableResolutionError('Maximum resolution depth exceeded', {
          code: 'E_MAX_DEPTH', 
          severity: ErrorSeverity.Fatal, 
          details: { context, variableName: 'Unknown (Max Depth)' }
      });
    }
    
    const newContext = context.withIncreasedDepth();
    // logger.debug(`[VRefResolver.resolve ENTRY] Resolving: ${node.identifier}, Fields: ${node.fields?.length ?? 0}, Strict: ${newContext.strict}, Depth: ${currentDepth}`);
    // process.stdout.write(`DEBUG: [VRefResolver.resolve ENTRY] Resolving: ${node.identifier}, Fields: ${node.fields?.length ?? 0}, Strict: ${newContext.strict}, Depth: ${currentDepth}\n`);

    try {
      // +++ Log Before getVariable +++
      process.stdout.write(`DEBUG: [VRefResolver.resolve] Attempting to get variable: ${node.identifier}, TypeHint: ${node.valueType}, State ID: ${newContext.state?.getStateId() ?? 'N/A'}\n`);
      const variable = await this.getVariable(node, newContext);
      // +++ Log After getVariable +++
      process.stdout.write(`DEBUG: [VRefResolver.resolve] Got variable: ${variable ? variable.type : 'undefined'}\n`);
      
      if (!variable) {
          if (!newContext.strict) {
            // process.stdout.write(`WARN: [VRefResolver.resolve] Non-strict mode, variable "${node.identifier}" not found, returning empty string.\n`);
             return '';
          }
          // process.stdout.write(`DEBUG: [VRefResolver.resolve] Variable not found & strict=true. Throwing E_VAR_NOT_FOUND for ${node.identifier}\n`);
          // Log before throwing
          const errorToThrow = new VariableResolutionError(`Variable not found: ${node.identifier}`, {
              code: 'E_VAR_NOT_FOUND',
              severity: ErrorSeverity.Recoverable, 
              details: { variableName: node.identifier, valueType: node.valueType }
          });
          // process.stdout.write(`DEBUG: [VRefResolver.resolve] THROWING (Strict Mode, Var Not Found): ${errorToThrow.name} - ${errorToThrow.message}\n`);
          throw errorToThrow;
      }

      // --- Check for InterpolatableValue first --- 
      // logger.debug(`[VRefResolver.resolve] Checking if value for ${node.identifier} is InterpolatableValueArray`);
      // process.stdout.write(`DEBUG: [VRefResolver.resolve] Checking if value for ${node.identifier} is InterpolatableValueArray\n`);
      if (isInterpolatableValueArray(variable.value)) {
          // logger.debug(`[VRefResolver.resolve] Value for ${node.identifier} IS InterpolatableValueArray. Type: ${typeof variable.value}, IsArray: ${Array.isArray(variable.value)}`);
          // process.stdout.write(`DEBUG: [VRefResolver.resolve] Value for ${node.identifier} IS InterpolatableValueArray. Type: ${typeof variable.value}, IsArray: ${Array.isArray(variable.value)}\n`);
          if (!this.resolutionService) {
              throw new MeldResolutionError('Cannot recursively resolve variable: ResolutionService instance is missing.', {
                  code: 'E_SERVICE_UNAVAILABLE', 
                  details: { variableName: node.identifier }
              });
          }
          // logger.debug(`[VRefResolver.resolve] Variable '${node.identifier}' contains an InterpolatableValue array. Performing recursive resolution.`);
          // process.stdout.write(`DEBUG: [VRefResolver.resolve] Variable '${node.identifier}' contains an InterpolatableValue array. Performing recursive resolution.\n`);
          // Recursive Call
          const recursiveResult = await this.resolutionService.resolveNodes(variable.value, newContext);
          // logger.debug(`[VRefResolver.resolve EXIT - Recursive] Resolved ${node.identifier} recursively to: '${recursiveResult.substring(0, 50)}...'`);
          // process.stdout.write(`DEBUG: [VRefResolver.resolve EXIT - Recursive] Resolved ${node.identifier} recursively to: '${recursiveResult.substring(0, 50)}...'\n`);
          return recursiveResult;
      } else {
           // logger.debug(`[VRefResolver.resolve] Value for ${node.identifier} is NOT InterpolatableValueArray. Type: ${typeof variable.value}, IsArray: ${Array.isArray(variable.value)}`);
           // process.stdout.write(`DEBUG: [VRefResolver.resolve] Value for ${node.identifier} is NOT InterpolatableValueArray. Type: ${typeof variable.value}, IsArray: ${Array.isArray(variable.value)}\n`);
      }

      // --- Path Variable Handling --- 
      if (isPathVariable(variable)) {
          // +++ Log Path Var Handling +++
          process.stdout.write(`DEBUG: [VRefResolver.resolve] Handling PathVariable: ${node.identifier}\n`);
          logger.debug(`Resolving PathVariable '${node.identifier}'`);
          const meldPathValueState = variable.value; // This is IFilesystemPathState or IUrlPathState
          // +++ Log Path Value State +++
          process.stdout.write(`DEBUG: [VRefResolver.resolve] PathValueState: ${JSON.stringify(meldPathValueState)}\n`);
          
          // Revert to returning originalValue. Validation/resolution should happen when path is used.
          // +++ Log Path Return Value +++
          process.stdout.write(`DEBUG: [VRefResolver.resolve PathVar EXIT] Returning originalValue: '${meldPathValueState.originalValue}'\n`);
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
          // logger.debug(`[VRefResolver.resolve] Processing ${variable.type} variable ${node.identifier}. Has fields: ${!!node.fields?.length}. Base value type: ${typeof baseValue}`);
          // process.stdout.write(`DEBUG: [VRefResolver.resolve] Processing ${variable.type} variable ${node.identifier}. Has fields: ${!!node.fields?.length}. Base value type: ${typeof baseValue}\n`);
          
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
                          // Log before throwing
                          // process.stdout.write(`DEBUG: [VRefResolver.resolve] Field access failed & strict=true. Throwing FieldAccessError for ${node.identifier}\n`);
                          // process.stdout.write(`DEBUG: [VRefResolver.resolve] THROWING (Strict Mode, Field Access Failed): ${fieldAccessResult.error.name} - ${fieldAccessResult.error.message}\n`);
                          throw fieldAccessResult.error; // Throw the FieldAccessError
                      }
                      finalResolvedValue = undefined; // Non-strict, treat as undefined
                  }
             } else {
                  // Tried to access fields on a non-object (e.g., primitive string from TextVariable)
                  if (newContext.strict) {
                      const errorMsg = `Cannot access fields on non-object variable "${node.identifier}"`;
                      // Log before throwing
                      const errorToThrow = new FieldAccessError(errorMsg, { 
                         baseValue: baseValue, 
                         fieldAccessChain: node.fields, 
                         failedAtIndex: 0, 
                         failedKey: node.fields[0]?.value ?? "unknown" 
                      });
                      // process.stdout.write(`DEBUG: [VRefResolver.resolve] Field access on non-object & strict=true. Throwing FieldAccessError for ${node.identifier}\n`);
                      // process.stdout.write(`DEBUG: [VRefResolver.resolve] THROWING (Strict Mode, Field Access Non-Object): ${errorToThrow.name} - ${errorToThrow.message}\n`);
                      throw errorToThrow;
                  }
                  finalResolvedValue = undefined; // Non-strict
             }
          } else {
              finalResolvedValue = baseValue; // Use the direct value if no fields
          }
          
          // Convert the final resolved value (which might be primitive, object, array) to a string
          const finalString = this.convertToString(finalResolvedValue, newContext);
          // logger.debug(`[VRefResolver.resolve EXIT - ${variable.type}] Resolved ${node.identifier} to string: '${finalString.substring(0, 50)}...'`);
          // process.stdout.write(`DEBUG: [VRefResolver.resolve EXIT - ${variable.type}] Resolved ${node.identifier} to string: '${finalString.substring(0, 50)}...'\n`);
          return finalString;

      } else {
           // Should not be reached if type guards are exhaustive
           throw new VariableResolutionError(`Unexpected variable type encountered for ${node.identifier}`, {
              code: 'E_UNEXPECTED_TYPE', 
              details: { variableName: node.identifier }
           });
      }

    } catch (error) {
        logger.warn(`[VRefResolver.resolve CATCH] Error resolving ${node.identifier}, strict=${newContext.strict}:`, { error });
        
        if (error instanceof FieldAccessError && newContext.strict) {
            logger.debug(`[VRefResolver.resolve CATCH] Strict mode, re-throwing FieldAccessError for ${node.identifier}`);
            throw error;
        }
        
        if (newContext.strict) {
            if (error instanceof MeldError) {
                logger.debug(`[VRefResolver.resolve CATCH] Strict mode, re-throwing MeldError for ${node.identifier}`);
                throw error;
            } else {
                 logger.debug(`[VRefResolver.resolve CATCH] Strict mode, wrapping and throwing other error for ${node.identifier}`);
                 throw new MeldResolutionError(`Failed to resolve variable ${node.identifier}`, {
                     code: 'E_RESOLVE_FAILED', 
                     cause: error instanceof Error ? error : undefined,
                     details: { 
                         variableName: node.identifier,
                         node: node,       
                         context: context  
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
    const currentState = context.state; 
    if (!currentState) {
        process.stderr.write(`ERROR: [VarRefResolver.getVariable] No state found in ResolutionContext for '${name}'\n`);
        return undefined;
    }
    // +++ Log getVariable Entry +++
    process.stdout.write(`DEBUG: [VRefResolver.getVariable ENTRY] name='${name}', specificType=${specificType}, StateID=${currentState.getStateId() ?? 'N/A'}\n`);

    this.resolutionTracker?.trackAttemptStart(name, `getVariable (type hint: ${specificType ?? 'any'})`);
    
    // process.stdout.write(`DEBUG: [VarRefResolver.getVariable] Calling context.state.getVariable for '${name}'. StateService Instance State ID: ${currentState.getStateId() ?? 'N/A'}\n`);
    const variable: MeldVariable | undefined = await currentState.getVariable(name, specificType as VariableType | undefined); 

    // +++ Log getVariable Success +++
    process.stdout.write(`DEBUG: [VRefResolver.getVariable EXIT] Found var '${name}' (Type: ${variable?.type}). StateID=${currentState.getStateId() ?? 'N/A'}\n`);
    if (variable) {
        // --- Type checking is now redundant here as getVariable handles it --- 
        // if (specificType && variable.type !== specificType) { ... }
        
        // Check allowed variable types in context
        if (context.allowedVariableTypes && !context.allowedVariableTypes.includes(variable.type)) {
            logger.warn(`Variable '${name}' found, but type ${variable.type} is not allowed in this context.`);
            if (this.resolutionTracker) {
                this.resolutionTracker.trackResolutionAttempt(name, `variable-type-disallowed`, false);
            }
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
        if (this.resolutionTracker) {
           this.resolutionTracker.trackResolutionAttempt(name, `${variable.type}-variable`, true, variable.value); 
        }
        logger.debug(`Found ${variable.type} variable '${name}'.`);
        return variable;
    } else {
        logger.warn(`Variable '${name}'${specificType ? ' (hinted type: ' + specificType + ')' : ''} not found in state.`);
        if (this.resolutionTracker) {
           this.resolutionTracker.trackResolutionAttempt(name, `variable-not-found (type hint: ${specificType ?? 'any'})`, false); 
        }
        // +++ Log getVariable Failure +++
        process.stdout.write(`DEBUG: [VRefResolver.getVariable EXIT] Var '${name}' not found. StateID=${currentState.getStateId() ?? 'N/A'}\n`);
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
    // logger.debug(`[ACCESS FIELDS ENTRY] Starting accessFields`, { baseValue: JSON.stringify(baseValue), fields: JSON.stringify(fields), variableName });
    // process.stdout.write(`DEBUG: [VRefResolver.accessFields ENTRY] var=${variableName}, fields=${JSON.stringify(fields)}, State ID: ${context.state?.getStateId() ?? 'N/A'}\n`);

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('');
      // logger.debug(`[ACCESS FIELDS] Accessing field: ${currentPathString}`, { currentValueType: typeof current });
      // process.stdout.write(`DEBUG: [VRefResolver.accessFields] Accessing: ${currentPathString}, currentType: ${typeof current}\n`);

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
          // logger.error(`[ACCESS FIELDS] Unexpected internal error during field access`, { variableName, field: field, currentPathString, internalError });
          process.stderr.write(`ERROR: [VRefResolver.accessFields] Unexpected internal error. var=${variableName}, field=${JSON.stringify(field)}, path=${currentPathString}, error=${internalError instanceof Error ? internalError.message : String(internalError)}\n`);
          const errorMsg = `Internal error accessing field '${field.value}'`;
          const errorDetails: FieldAccessErrorDetails = { baseValue, fieldAccessChain: fields, failedAtIndex: i, failedKey: field.value };
          return failure(new FieldAccessError(errorMsg, errorDetails, internalError instanceof Error ? internalError : undefined));
      }
    }
    // logger.debug(`[ACCESS FIELDS EXIT] Completed successfully. Final value: ${JSON.stringify(current)}`);
    // process.stdout.write(`DEBUG: [VRefResolver.accessFields EXIT] var=${variableName}, result=${JSON.stringify(current)}\n`);
    return success(current);
  }

  /**
   * Converts a resolved value to its string representation for final output/use.
   */
  private convertToString(value: JsonValue | string | undefined, context: ResolutionContext): string {
      // process.stdout.write(`DEBUG: [VRefResolver.convertToString ENTRY] Type: ${typeof value}, Value: ${String(value).substring(0,50)}..., State ID: ${context.state?.getStateId() ?? 'N/A'}\n`);
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
