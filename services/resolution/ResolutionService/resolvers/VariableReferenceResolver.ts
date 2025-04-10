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
} from '@core/syntax/types/shared-types';

/**
 * Handles resolution of variable references based on VariableReferenceNode AST.
 */
@injectable()
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
      const variable = await this.stateService.getVariable(node.identifier);
      
      if (!variable) {
          if (!newContext.strict) return '';
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, {
              code: 'E_VAR_NOT_FOUND',
              severity: ErrorSeverity.Recoverable, 
              details: { variableName: node.identifier }
          });
      }

      // --- Path Variable Handling --- 
      if (isPathVariable(variable)) {
          logger.debug(`Resolving PathVariable '${node.identifier}'`);
          const meldPathValue = variable.value;
          
          try {
              const pathValidationContext: PathValidationContext = {
                  workingDirectory: (newContext.pathContext?.baseDir ?? '.') as NormalizedAbsoluteDirectoryPath,
                  allowExternalPaths: newContext.pathContext?.allowTraversal ?? !newContext.strict,
                  rules: {
                      ...(newContext.pathContext?.constraints ?? {}),
                      allowAbsolute: true,
                      allowRelative: true,
                      allowParentTraversal: !newContext.strict
                  }
              };
              
              const pathInput = meldPathValue.originalValue as RawPath;
              // Reinstate ignore due to flow analysis issue
              // @ts-ignore - TS unable to guarantee state/method is defined here
              const baseDir = newContext.state.getCurrentFilePath() ?? '.';
              
              if (!this.pathService) {
                  throw new MeldResolutionError('PathService unavailable', { code: 'E_SERVICE_UNAVAILABLE'});
              }
              
              // Assign to local constant after check
              const pathService = this.pathService!;
              
              // Put ts-ignore back above the line
              // @ts-ignore - TS unable to guarantee non-null despite checks/assertions
              const resolvedPath = 
                  await pathService.resolvePath(pathInput, baseDir as RawPath);
              const validatedPath = await pathService.validatePath(resolvedPath, pathValidationContext);
              
              return validatedPath.validatedPath as string; 

          } catch (error) {
              logger.error(`Error resolving/validating path variable ${node.identifier}`, { error });
              if (newContext.strict) throw error;
              return '';
          }
      }
      
      // --- Command Variable Handling ---
      else if (isCommandVariable(variable)) {
          logger.debug(`Resolving CommandVariable '${node.identifier}'`);
          return JSON.stringify(variable.value); 
      }
      
      // --- Text/Data Variable Handling ---
      else {
          let variableValue: JsonValue | string | undefined;
          let dataForAccess: JsonValue | undefined;
          const originalVariable = variable; // Keep reference to original variable object
          
          if (isTextVariable(variable)) {
              variableValue = variable.value;
          } else if (isDataVariable(variable)) {
              variableValue = variable.value;
              dataForAccess = variable.value;
          } else {
              // This case should ideally not be hit if variable type checks are exhaustive
              throw new VariableResolutionError(`Unexpected variable type for ${node.identifier}`, { 
                code: 'E_UNEXPECTED_TYPE', 
                details: { variableName: node.identifier }
              });
          }

          let finalResolvedValue: JsonValue | string | undefined;
          
          if (node.fields && node.fields.length > 0) {
             if (dataForAccess !== undefined) {
                  const fieldAccessResult = await this.accessFields(dataForAccess, node.fields, node.identifier, newContext);
                  if (fieldAccessResult.success) {
                      finalResolvedValue = fieldAccessResult.value;
                  } else {
                      if (newContext.strict) {
                          throw fieldAccessResult.error;
                      }
                      finalResolvedValue = undefined; // Represent failure as undefined before final string conversion
                  }
             } else {
                  if (newContext.strict) {
                      const errorMsg = `Cannot access fields on non-data variable '${node.identifier}'`;
                      throw new FieldAccessError(errorMsg, { 
                         baseValue: variableValue, 
                         fieldAccessChain: node.fields, 
                         failedAtIndex: 0, 
                         failedKey: node.fields[0]?.value ?? 'unknown' 
                      });
                  }
                  finalResolvedValue = undefined;
             }
          } else {
              finalResolvedValue = variableValue; // Use the direct value if no fields
          }
          
          // Convert the final resolved value to a string appropriately
          if (finalResolvedValue === undefined) {
              return ''; // Return empty string for failed/undefined resolution
          } else if (finalResolvedValue === null) {
              return 'null';
          } else if (typeof finalResolvedValue === 'string') {
              // This correctly handles the case where the original was TextVariable with no fields,
              // as finalResolvedValue would be the string value itself.
              return finalResolvedValue;
          } else {
              // For DataVariables, results of field access, or other complex types, JSON.stringify
              try {
                  return JSON.stringify(finalResolvedValue);
              } catch (e) {
                  logger.error(`Error stringifying resolved value for ${node.identifier}`, { value: finalResolvedValue, error: e });
                  if (newContext.strict) {
                      throw new MeldResolutionError(`Could not stringify resolved value for ${node.identifier}`, {
                          code: 'E_STRINGIFY_FAILED',
                          cause: e
                      });
                  }
                  return '';
              }
          }
      }

    } catch (error) {
        logger.warn(`[RESOLVE CATCH] Error resolving ${node.identifier}:`, { error });
        
        if (newContext.strict) {
            throw error; 
        }
        
        if (error instanceof MeldError && 
            (error.severity === ErrorSeverity.Fatal)) { 
             logger.error(`[RESOLVE] Throwing non-suppressed fatal/critical error for ${node.identifier} in non-strict mode`, { error });
             throw error;
        }
        
        console.warn(`[RESOLVE] Non-strict mode, suppressing error for ${node.identifier}, returning empty string.`);
        return ''; 
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
    // Add logging: Entry point
    console.log(`[getVariable] Entered for identifier: ${node.identifier}, typeHint: ${node.valueType}`);
    
    const name = node.identifier;
    const type = node.valueType || VariableType.TEXT; // Default to TEXT if not specified
    this.resolutionTracker?.trackAttemptStart(name, `getVariable (type: ${type})`);
    
    let variable: MeldVariable | undefined = undefined;

    // Use node.valueType for targeted lookup
    switch(type) {
        case VariableType.TEXT:
            // Add logging: Calling stateService method
            console.log(`[getVariable] Calling stateService.getTextVar('${name}')`);
            variable = this.stateService.getTextVar(name);
            break;
        case VariableType.DATA:
            // Add logging: Calling stateService method
            console.log(`[getVariable] Calling stateService.getDataVar('${name}')`);
            variable = this.stateService.getDataVar(name);
            break;
        case VariableType.PATH:
            // Add logging: Calling stateService method
            console.log(`[getVariable] Calling stateService.getPathVar('${name}')`);
            variable = this.stateService.getPathVar(name);
            break;
        case VariableType.COMMAND:
            // Add logging: Calling stateService method
            console.log(`[getVariable] Calling stateService.getCommandVar('${name}')`);
            variable = this.stateService.getCommandVar(name);
            break;
        default:
            logger.warn(`Unsupported variable type specified in node: ${type}`);
            // Fall through to variable not found
    }

    if (variable) {
        this.resolutionTracker?.trackResolutionAttempt(name, `${type}-variable`, true, variable.value);
        logger.debug(`Found ${type} variable '${name}'.`);
        // Add logging: Variable found
        console.log(`[getVariable] Found variable '${name}':`, JSON.stringify(variable, null, 2));
        return variable;
    } else {
        // Variable of the specific type not found
        logger.warn(`${type.charAt(0).toUpperCase() + type.slice(1)} variable '${name}' not found in state.`);
        this.resolutionTracker?.trackResolutionAttempt(name, `variable-not-found (type: ${type})`, false);
        // Add logging: Variable not found
        console.log(`[getVariable] Variable '${name}' of type ${type} NOT FOUND.`);
        return undefined;
    }
  }

  /**
   * Access fields on a value based on an AST Field array.
   *
   * @param baseValue The starting value (object or array).
   * @param fields The ordered array of AST Field objects ({ type: 'field' | 'index', value: string | number }).
   * @param variableName The name of the base variable (for error reporting).
   * @param context The resolution context.
   * @returns A Result containing the final value or a FieldAccessError.
   */
  public async accessFields(
    baseValue: JsonValue, 
    fields: AstField[],
    variableName: string,
    context: ResolutionContext
  ): Promise<Result<JsonValue | undefined>> {
    let current: JsonValue | undefined = baseValue;
    logger.debug(`[ACCESS FIELDS ENTRY] Starting accessFields`, { baseValue: JSON.stringify(baseValue), fields: JSON.stringify(fields), variableName });

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('');
      logger.debug(`[ACCESS FIELDS] Accessing field: ${currentPathString}`, { currentValueType: typeof current });

      // Use process.stdout.write for debug logging
      process.stdout.write(`[DEBUG VariableReferenceResolver.accessFields] field.type = ${field.type}, field.value = ${JSON.stringify(field.value)}\n`);

      if (current === undefined || current === null) {
         const errorMsg = `Cannot access field '${field.value}' on null or undefined value at path ${currentPathString}`;
         const errorDetails: FieldAccessErrorDetails = { 
             baseValue,
             fieldAccessChain: fields as any, 
             failedAtIndex: i, 
             failedKey: field.value
         };
         return Promise.reject(new FieldAccessError(errorMsg, errorDetails));
      }

      if (field.type === 'field') { 
        const key = String(field.value);
        logger.debug(`[ACCESS FIELDS] Processing field type 'field'`, { key, currentType: typeof current }); // Log current type
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          // Log before checking property
          logger.debug(`[ACCESS FIELDS] Checking property '${key}' on object`, { keys: Object.keys(current) });
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            current = (current as Record<string, JsonValue>)[key];
            logger.debug(`[ACCESS FIELDS] Property '${key}' found. New current value: ${JSON.stringify(current)}`); // Log new value
          } else {
            const availableKeys = Object.keys(current).join(', ') || '(none)';
            const errorMsg = `Field '${key}' not found in object. Available keys: ${availableKeys}`;
            logger.warn(`[ACCESS FIELDS] Error: ${errorMsg}`); // Log warning before failure
            const errorDetails: FieldAccessErrorDetails = { 
                baseValue: current, // The object being accessed
                fieldAccessChain: fields as any, 
                failedAtIndex: i, 
                failedKey: key // The key that failed
            };
            return Promise.reject(new FieldAccessError(errorMsg, errorDetails));
          }
        } else {
          // Log type issue
          logger.warn(`[ACCESS FIELDS] Error: Cannot access property '${key}' on non-object/array`, { currentType: typeof current, isArray: Array.isArray(current) });
          const errorDetails: FieldAccessErrorDetails = { 
              baseValue: current, // The non-object value
              fieldAccessChain: fields as any, 
              failedAtIndex: i, 
              failedKey: key // The key that failed
          };
          return Promise.reject(new FieldAccessError(`Cannot access property '${key}' on non-object or array`, errorDetails));
        }
      } else if (field.type === 'index') {
        const index = Number(field.value);
        logger.debug(`[ACCESS FIELDS] Processing field type 'index'`, { index, currentType: typeof current }); // Log current type
        if (isNaN(index) || !Number.isInteger(index)) {
            logger.warn(`[ACCESS FIELDS] Error: Invalid array index '${field.value}'`);
            const errorDetails: FieldAccessErrorDetails = { 
                baseValue: current,
                fieldAccessChain: fields as any, 
                failedAtIndex: i, 
                failedKey: field.value
            };
            return Promise.reject(new FieldAccessError(`Invalid array index '${field.value}'`, errorDetails));
        }
        if (Array.isArray(current)) {
          logger.debug(`[ACCESS FIELDS] Checking index '${index}' on array`, { length: current.length }); // Log array length
          if (index >= 0 && index < current.length) {
            current = current[index];
            logger.debug(`[ACCESS FIELDS] Index '${index}' found. New current value: ${JSON.stringify(current)}`); // Log new value
          } else {
            logger.warn(`[ACCESS FIELDS] Error: Index '${index}' out of bounds for array`, { length: current.length }); // Log warning
            const errorDetails: FieldAccessErrorDetails = { 
                baseValue: current,
                fieldAccessChain: fields as any, 
                failedAtIndex: i, 
                failedKey: index
            };
            return Promise.reject(new FieldAccessError(`Index '${index}' out of bounds for array of length ${current.length}`, errorDetails));
          }
        } else {
          logger.warn(`[ACCESS FIELDS] Error: Cannot access index '${index}' on non-array value`, { currentType: typeof current }); // Log warning
          const errorDetails: FieldAccessErrorDetails = { 
              baseValue: current,
              fieldAccessChain: fields as any, 
              failedAtIndex: i, 
              failedKey: index
          };
          return Promise.reject(new FieldAccessError(`Cannot access index '${index}' on non-array value`, errorDetails));
        }
      } else {
          const unknownType = (field as any).type;
          const errorDetails: FieldAccessErrorDetails = { 
              baseValue: current,
              fieldAccessChain: fields as any, 
              failedAtIndex: i, 
              failedKey: 'unknown'
          };
          return Promise.reject(new FieldAccessError(`Unknown field access type: '${unknownType}'`, errorDetails));
      }
    }
    // Use process.stdout.write for debug logging
    process.stdout.write(`[DEBUG VariableReferenceResolver.accessFields EXIT] Completed successfully. Final value: ${JSON.stringify(current)}\n`);
    return success(current);
  }

  // Updated convertToString to handle potentially undefined input from field access failure
  private convertToString(value: JsonValue | string | undefined, context: ResolutionContext): string {
      if (value === undefined || value === null) {
          return '';
      }
      if (typeof value === 'string') {
          return value;
      }
      try {
          const indent = context.formattingContext?.isBlock ? 2 : undefined;
          return JSON.stringify(value, null, indent);
      } catch (e) {
          logger.error('Error stringifying value for conversion', { e });
          try {
              return String(value);
          } catch (e2) {
               logger.error('Fallback String() conversion failed', { e2 });
               return '[Unstringifiable Object]';
          }
      }
  }
}