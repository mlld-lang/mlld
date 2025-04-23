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
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import { Service } from '@core/ServiceProvider';
import { container, inject, injectable } from 'tsyringe';
import { resolutionLogger as logger } from '@core/utils/logger';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index';

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
  private resolutionClient: IResolutionServiceClient;
  private parserClient?: IParserServiceClient;
  private parserClientFactory?: ParserServiceClientFactory;
  private pathService: IPathService;

  /**
   * Creates a new instance of the VariableReferenceResolver
   * @param stateService - Refactored State service instance
   * @param pathService - Added Path service instance
   * @param resolutionServiceClientFactory - Factory to create the resolution client
   * @param parserService - Optional Parser service instance (fallback/tests)
   */
  constructor(
    @inject('IStateService') private readonly stateService: IStateService,
    @inject('IPathService') pathService: IPathService,
    @inject(ResolutionServiceClientFactory) resolutionServiceClientFactory: ResolutionServiceClientFactory,
    @inject('IParserService') private readonly parserService?: IParserService
  ) {
    logger.debug('VariableReferenceResolver initialized.');
    this.pathService = pathService;
    this.resolutionClient = resolutionServiceClientFactory.createClient();
    this.initializeParserClient();
  }

  private initializeParserClient(): void {
    if (!this.parserService && !this.parserClient) {
      try {
        this.parserClientFactory = container.resolve('ParserServiceClientFactory');
        this.parserClient = this.parserClientFactory.createClient();
        logger.debug('Successfully created ParserServiceClient');
      } catch (error) {
        logger.warn('Failed to create ParserServiceClient, will use regex fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ParserService, skipping client factory');
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
            return '';
          }
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, {
              code: 'E_VAR_NOT_FOUND',
              severity: ErrorSeverity.Recoverable, 
              details: { variableName: node.identifier, valueType: node.valueType }
          });
      }

      if (isInterpolatableValueArray(variable.value)) {
          if (!this.resolutionClient) {
              throw new MeldResolutionError('Cannot recursively resolve variable: ResolutionServiceClient is missing.', {
                  code: 'E_SERVICE_UNAVAILABLE', 
                  details: { variableName: node.identifier }
              });
          }
          const recursiveResult = await this.resolutionClient.resolveNodes(variable.value, newContext);
          return recursiveResult;
      } else {
           if (isPathVariable(variable)) {
              const meldPathValueState = variable.value; 
              return meldPathValueState.originalValue; 
          }
          
          else if (isCommandVariable(variable)) {
              logger.debug(`Resolving CommandVariable '${node.identifier}'`);
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
          
          else if (isTextVariable(variable) || isDataVariable(variable)) {
              let baseValue: JsonValue | string | undefined = variable.value;
              let finalResolvedValue: JsonValue | string | undefined;
              if (node.fields && node.fields.length > 0) {
                 const fieldAccessResult = await this.accessFields(baseValue as JsonValue, node.fields, node.identifier, newContext);
                 if (fieldAccessResult.success) {
                     finalResolvedValue = fieldAccessResult.value;
                 } else {
                     if (newContext.strict) {
                         throw fieldAccessResult.error; 
                     }
                     finalResolvedValue = undefined; 
                 }
              } else {
                  finalResolvedValue = baseValue; 
              }
              
              const finalString = this.convertToString(finalResolvedValue, newContext);
              return finalString;

          } else {
               throw new VariableResolutionError(`Unexpected variable type encountered for ${node.identifier}`, {
                  code: 'E_UNEXPECTED_TYPE', 
                  details: { variableName: node.identifier }
               });
          }

      }

    } catch (error) {
        logger.warn(`[VRefResolver.resolve CATCH] Error resolving ${node.identifier}, strict=${newContext.strict}:`, { error });
        
        if (error instanceof FieldAccessError && newContext.strict) {
            throw error;
        }
        
        if (newContext.strict) {
            if (error instanceof MeldError) {
                throw error;
            } else {
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
        
        if (error instanceof MeldError && error.severity === ErrorSeverity.Fatal) { 
             throw error;
        }
        
        if (context.flags?.preserveUnresolved) { 
            logger.warn(`[RESOLVE] Non-strict mode & preserveUnresolved=true, returning original tag for ${node.identifier}.`);
            let tag = `{{${node.identifier}}}`; 
            if (node.fields && node.fields.length > 0) {
                tag = `{{${node.identifier}${node.fields.map((f) => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('')}}}`; 
            }
            return tag;
        }

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
    try {
      // const allVars = await currentState.getAllVariables();
      // process.stdout.write(`DEBUG: [VRefResolver.getVariable] State Content (StateID: ${currentState.getStateId() ?? 'N/A'}): ${JSON.stringify(allVars, null, 2)}\n`);
    } catch (logError) {
      process.stderr.write(`ERROR logging state content: ${logError}\n`);
    }
    this.resolutionTracker?.trackAttemptStart(name, `getVariable (type hint: ${specificType ?? 'any'})`);
    
    const variable: MeldVariable | undefined = await currentState.getVariable(name, specificType as VariableType | undefined); 

    if (variable) {
        process.stdout.write(`DEBUG: [VRefResolver.getVariable EXIT] Found var '${name}' (Type: ${variable?.type}). StateID=${currentState.getStateId() ?? 'N/A'}\n`);
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
        process.stdout.write(`DEBUG: [VRefResolver.getVariable EXIT] Var '${name}' not found. StateID=${currentState.getStateId() ?? 'N/A'}\n`);
        if (this.resolutionTracker) {
           this.resolutionTracker.trackResolutionAttempt(name, `variable-not-found (type hint: ${specificType ?? 'any'})`, false); 
        }
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
  ): Promise<Result<JsonValue | undefined, FieldAccessError>> { 
    let current: JsonValue | undefined = baseValue;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === 'index' ? `[${f.value}]` : `.${f.value}`).join('');
      try { 
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
          const errorMsg = `Internal error accessing field '${field.value}'`;
          const errorDetails: FieldAccessErrorDetails = { baseValue, fieldAccessChain: fields, failedAtIndex: i, failedKey: field.value };
          return failure(new FieldAccessError(errorMsg, errorDetails, internalError instanceof Error ? internalError : undefined));
      }
    }
    return success(current);
  }

  /**
   * Converts a resolved value to its string representation for final output/use.
   */
  private convertToString(value: JsonValue | string | undefined, context: ResolutionContext): string {
      if (value === undefined || value === null) {
          return '';
      }
      if (typeof value === 'string') {
          return value;
      }
      try {
          const indent = context.formattingContext?.indentationLevel;
          return JSON.stringify(value, null, indent);
      } catch (e) {
          logger.error('Error stringifying value for conversion', { error: e });
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
