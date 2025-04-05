import type { IStateService } from '@services/state/IStateService.js';
import type { ResolutionContext, JsonValue, FieldAccessError, FieldAccess, Result } from '@core/types';
import { VariableType } from '@core/types';
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
@injectable()
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
    @inject('IStateService') private readonly stateService: IStateService,
    @inject('IResolutionService') private readonly resolutionService?: IResolutionService,
    @inject('IParserService') private readonly parserService?: IParserService
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
          throw new VariableResolutionError(
             `Failed to resolve variable: ${node.identifier}`, 
             {
               code: 'E_RESOLVE_VAR_FAILED', // General code
               details: {
                 variableName: node.identifier,
                 variableType: node.valueType,
                 resolutionContext: newContext,
               },
               cause: error, // Pass original error here
               severity: (error as MeldError)?.severity || ErrorSeverity.Fatal // Inherit severity if possible
             }
           );
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
}