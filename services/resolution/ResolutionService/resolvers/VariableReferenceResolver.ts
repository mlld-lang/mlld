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
import { FieldAccessType } from '@core/types';

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
   
    console.log(`[RESOLVE] Start: Resolving ${node.identifier}`, { fields: node.fields, typeHint: node.valueType, depth: currentDepth });

    try {
      const variable = await this.getVariable(node, newContext); 
      console.log(`[RESOLVE] getVariable result for ${node.identifier}:`, variable ? { type: variable.type, valuePreview: JSON.stringify(variable.value)?.substring(0,50) } : 'undefined');
      
      if (!variable) {
        // Handle not found based on strict mode
        if (newContext.strict) {
          console.error(`[RESOLVE] Strict mode: Variable not found: ${node.identifier}`);
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, node.identifier, newContext);
        }
        console.warn(`[RESOLVE] Non-strict mode: Variable not found: ${node.identifier}, returning empty string.`);
        return ''; // Return empty string if not found and not strict
      }

      let resolvedValue: JsonValue = variable.value; 

      if (node.fields && node.fields.length > 0) {
        console.log(`[RESOLVE] Attempting field access for ${node.identifier}:`, node.fields);
        let dataForAccess: JsonValue | undefined = undefined;
        let isVariableData = false;

        if (isDataVariable(variable)) {
          console.log(`[RESOLVE] Variable ${node.identifier} is DataVariable.`);
          dataForAccess = variable.value;
          isVariableData = true;
        } else if (isTextVariable(variable) && typeof variable.value === 'string') {
           console.log(`[RESOLVE] Variable ${node.identifier} is TextVariable, attempting JSON parse.`);
           try {
               dataForAccess = JSON.parse(variable.value);
               console.log(`[RESOLVE] Successfully parsed TextVariable value for field access.`);
               isVariableData = true; // Treat parsed string as data
           } catch (parseError) {
               console.warn(`[RESOLVE] Failed to parse TextVariable value as JSON for field access: ${variable.value.substring(0,100)}`);
               // dataForAccess remains undefined
           }
            } else {
             console.log(`[RESOLVE] Variable ${node.identifier} is neither DataVariable nor parseable TextVariable (type: ${variable.type}).`);
             // dataForAccess remains undefined
        }

        // Proceed with field access ONLY if we have valid data (original or parsed)
        if (isVariableData && dataForAccess !== undefined) {
             console.log(`[RESOLVE] Proceeding with accessFields.`);
             const fieldAccessResult = await this.accessFields(dataForAccess, node.fields, newContext);
             if (fieldAccessResult.success) {
                 resolvedValue = fieldAccessResult.value;
                 console.log(`[RESOLVE] Field access successful for ${node.identifier}. New value preview:`, JSON.stringify(resolvedValue)?.substring(0,50));
          } else {
                 console.warn(`[RESOLVE] Field access failed for ${node.identifier}:`, fieldAccessResult.error.message);
                 if (newContext.strict) {
                     throw fieldAccessResult.error; 
                 }
                 resolvedValue = ''; 
            }
          } else {
            // Handle cases where field access is attempted on incompatible types
            const errorMsg = `Cannot access fields on variable: ${node.identifier} (type: ${variable.type}, not valid data for access)`;
            console.warn(`[RESOLVE] ${errorMsg}`);
            if (newContext.strict) {
                 throw new VariableResolutionError(errorMsg, node.identifier, newContext, { fieldAccessAttempted: true });
            }
             resolvedValue = ''; 
        }
      } else {
          console.log(`[RESOLVE] No fields to access for ${node.identifier}.`);
      }
      
      const stringValue = this.convertToString(resolvedValue, newContext);
      console.log(`[RESOLVE] Converted value to string for ${node.identifier}:`, stringValue.substring(0,100));
      
      if (stringValue.includes('{{') && this.resolutionService) {
           console.log(`[RESOLVE] Result contains nested variables, resolving recursively: ${stringValue.substring(0,100)}`);
           return await this.resolutionService.resolveText(stringValue, newContext);
      }

      console.log(`[RESOLVE] Final resolved value for ${node.identifier}: ${stringValue.substring(0,100)}`);
      return stringValue;

      } catch (error) {
      console.error(`[RESOLVE] Error during resolution for ${node.identifier}:`, error);
      if (error instanceof CoreFieldAccessError && !newContext.strict) {
           console.warn(`[RESOLVE] Non-strict mode, suppressing FieldAccessError for ${node.identifier}`);
           return ''; 
      }
      if (newContext.strict) {
          throw VariableResolutionError.fromError(error, `Failed to resolve variable: ${node.identifier}`, newContext);
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
      // Force logs with console.log for visibility
      console.log('[ACCESS_FIELDS] Start:', { fields, baseValueType: typeof baseValue, baseValuePreview: JSON.stringify(baseValue)?.substring(0, 50) }); 
      let current: JsonValue = baseValue;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === FieldAccessType.INDEX ? `[${f.key}]` : `.${f.key}`).join('');
      console.log(`[ACCESS_FIELDS] Step ${i+1}/${fields.length}: Accessing field`, { 
          type: field.type, 
          key: field.key, 
          currentValueType: typeof current, 
          currentValuePreview: JSON.stringify(current)?.substring(0, 50), 
          pathSoFar: currentPathString 
      });

      if (current === null || typeof current !== 'object') {
        const errorMsg = `Cannot access field '${field.key}' on non-object value: ${typeof current} (path: ${currentPathString})`;
        console.warn('[ACCESS_FIELDS] WARN:', errorMsg); // Use console.warn
        const error = new FieldAccessError(errorMsg, baseValue, fields, i);
        return failure(error);
      }

      if (field.type === FieldAccessType.PROPERTY) {
        const key = String(field.key); 
        if (!Array.isArray(current)) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            current = (current as Record<string, JsonValue>)[key];
            console.log(`[ACCESS_FIELDS] Accessed property '${key}', new value type: ${typeof current}`);
          } else {
            const availableKeys = Object.keys(current).join(', ') || '(none)';
            const errorMsg = `Field '${key}' not found in object (path: ${currentPathString}). Available keys: ${availableKeys}`;
            console.warn('[ACCESS_FIELDS] WARN:', errorMsg);
            const error = new FieldAccessError(errorMsg, baseValue, fields, i);
            return failure(error);
          }
        } else {
          const errorMsg = `Cannot access property '${key}' on an array (path: ${currentPathString}).`;
          console.warn('[ACCESS_FIELDS] WARN:', errorMsg);
          const error = new FieldAccessError(errorMsg, baseValue, fields, i);
          return failure(error);
        }
      } else if (field.type === FieldAccessType.INDEX) {
        if (Array.isArray(current)) {
          const index = Number(field.key);
          if (Number.isInteger(index) && index >= 0 && index < current.length) {
        current = current[index];
            console.log(`[ACCESS_FIELDS] Accessed index [${index}], new value type: ${typeof current}`);
      } else {
            const errorMsg = `Index '${field.key}' out of bounds for array of length ${current.length} (path: ${currentPathString}).`;
            console.warn('[ACCESS_FIELDS] WARN:', errorMsg);
            const error = new FieldAccessError(errorMsg, baseValue, fields, i);
            return failure(error);
          }
        } else {
          const errorMsg = `Cannot access index '${field.key}' on non-array value (path: ${currentPathString}).`;
          console.warn('[ACCESS_FIELDS] WARN:', errorMsg);
          const error = new FieldAccessError(errorMsg, baseValue, fields, i);
          return failure(error);
        }
          } else {
          const errorMsg = `Unknown field access type: '${(field as any).type}' (path: ${currentPathString}).`;
          console.error('[ACCESS_FIELDS] ERROR:', errorMsg); // Use console.error
          const error = new FieldAccessError(errorMsg, baseValue, fields, i);
          return failure(error);
      }
    }
      
    console.log('[ACCESS_FIELDS] Success:', { finalValueType: typeof current, finalValuePreview: JSON.stringify(current)?.substring(0, 50) }); 
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
      try {
          const indent = context.formattingContext?.isBlock ? 2 : undefined;
          return JSON.stringify(value, null, indent);
      } catch (e) {
          logger.error('Error stringifying value for conversion', { e });
          return String(value);
      }
  }
}
