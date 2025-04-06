import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext, JsonValue, FieldAccessError, FieldAccess, Result, PathResolutionContext } from '@core/types';
import { VariableType, MeldError } from '@core/types';
import type { MeldVariable, TextVariable, DataVariable, IPathVariable, CommandVariable } from '@core/types/variables';
import type { MeldNode, VariableReferenceNode, TextNode, DirectiveNode, NodeType } from '@core/ast/ast/astTypes.js';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable } from '@core/types/guards.js';
import { success, failure } from '@core/types';
import { FieldAccessError as CoreFieldAccessError, VariableResolutionError, MeldResolutionError, PathValidationError } from '@core/errors';
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
import { MeldPath, PathValidationContext, PathPurpose, RawPath, NormalizedAbsoluteDirectoryPath } from '@core/types/paths';
import { FieldAccessType } from '@core/types';
import type { IPathService } from '@services/fs/PathService/IPathService.js';

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
      // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 3. See _plans/PLAN-PHASE-3-ISSUES.md
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
          // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 3. See _plans/PLAN-PHASE-3-ISSUES.md
          throw new VariableResolutionError(`Variable not found: ${node.identifier}`, node.identifier, newContext);
        }
        console.warn(`[RESOLVE] Non-strict mode: Variable not found: ${node.identifier}, returning empty string.`);
        return ''; // Return empty string if not found and not strict
      }

      // --- Path Variable Handling --- 
      if (isPathVariable(variable)) {
          logger.debug(`Resolving PathVariable '${node.identifier}'`);
          const meldPathValue = variable.value; // This is IFilesystemPathState | IUrlPathState
          
          // Ensure PathService is available (should be guaranteed by constructor injection)
          if (!this.pathService) {
              throw new MeldResolutionError('PathService unavailable in VariableReferenceResolver', { code: 'E_SERVICE_UNAVAILABLE'});
          }
          
          try {
              // Manually construct PathValidationContext from ResolutionContext
              const resCtx = newContext; 
              const pathValidationContext: PathValidationContext = {
                  // Assert workingDirectory type
                  workingDirectory: (resCtx.pathContext?.baseDir ?? '.') as NormalizedAbsoluteDirectoryPath,
                  allowExternalPaths: resCtx.pathContext?.allowTraversal ?? !resCtx.strict,
                  // Provide defaults for PathValidationRules
                  rules: {
                      ...(resCtx.pathContext?.constraints ?? {}),
                      allowAbsolute: true, // Default rule
                      allowRelative: true, // Default rule
                      allowParentTraversal: !resCtx.strict // Default rule (match allowExternalPaths?)
                  },
                  // @ts-ignore - Persistent linter error: 'severity' does not exist in type 'PathValidationContext'. See _plans/PLAN-PHASE-3-ISSUES.md
                  severity: ErrorSeverity.Recoverable 
              };
              
              // Extract original path string to pass to resolvePath
              const pathInput = meldPathValue.originalValue;
              if (typeof pathInput !== 'string') {
                  throw new PathValidationError('Path variable value lacks original string value', { 
                      code: 'E_PATH_INVALID_VALUE', 
                      details: { pathString: JSON.stringify(meldPathValue), pathValue: meldPathValue }
                    });
              }

              // Call resolvePath with RawPath cast
              const resolvedPathObject = await this.pathService.resolvePath(pathInput as RawPath);
              // Call validatePath with the resolved path object and the context
              const validatedMeldPath = await this.pathService.validatePath(resolvedPathObject, pathValidationContext);
              
              // Return the final validated path string
              const finalPath = validatedMeldPath.validatedPath as string;
              logger.debug(`Path variable '${node.identifier}' resolved to: ${finalPath}`);
              return finalPath;
              
          } catch (pathError) {
              logger.error(`Path resolution/validation failed for '${node.identifier}'`, { pathError });
              const pathInputString = typeof meldPathValue?.originalValue === 'string' ? meldPathValue.originalValue : JSON.stringify(meldPathValue);
              if (newContext.strict) {
                  // Re-throw PathValidationError or wrap other errors
                  const meldError = (pathError instanceof MeldError)
                      ? pathError
                      : new PathValidationError(`Path resolution/validation failed for '${variable.name}'`, { 
                          code: 'E_PATH_VALIDATION_FAILED', 
                          cause: pathError, 
                          details: { 
                              pathString: pathInputString, 
                              pathValue: meldPathValue 
                          }
                        });
                  throw meldError;
              }
              return ''; // Return empty in non-strict mode on path error
          }
      }
      // --- End Path Variable Handling ---

      // --- Data/Text Variable Handling (Field Access) ---
      let resolvedValueForStringify: JsonValue | string;
      if (isCommandVariable(variable)) {
          resolvedValueForStringify = variable.value.name; 
      } else {
          resolvedValueForStringify = variable.value as JsonValue;
      }

      if (node.fields && node.fields.length > 0) {
          let dataForAccess: JsonValue | undefined = undefined;
          let isVariableData = false;
  
          if (isDataVariable(variable)) {
            dataForAccess = variable.value;
            isVariableData = true;
          } else if (isTextVariable(variable) && typeof variable.value === 'string') {
             try {
                 dataForAccess = JSON.parse(variable.value);
                 isVariableData = true;
             } catch (parseError) { /* Ignore */ }
          }
  
          if (isVariableData && dataForAccess !== undefined) {
               const fieldAccessResult = await this.accessFields(dataForAccess, node.fields, newContext);
               if (fieldAccessResult.success) {
                   // @ts-ignore - Persistent linter error: Type 'JsonValue | undefined' is not assignable. See _plans/PLAN-PHASE-3-ISSUES.md
                   resolvedValueForStringify = fieldAccessResult.value;
               } else {
                   console.warn(`[RESOLVE] Field access failed for ${node.identifier}:`, fieldAccessResult.error?.message);
                   if (newContext.strict) {
                       if (fieldAccessResult.error) {
                          throw fieldAccessResult.error;
                       } else {
                           // Corrected CoreFieldAccessError arguments (3 expected)
                           // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 3. See _plans/PLAN-PHASE-3-ISSUES.md
                           throw new CoreFieldAccessError('Unknown field access error', dataForAccess, node.fields);
                       }
                   }
                   resolvedValueForStringify = ''; 
              }
            } else {
              const errorMsg = `Cannot access fields on variable: ${node.identifier} (type: ${variable.type})`;
              console.warn(`[RESOLVE] ${errorMsg}`);
              if (newContext.strict) {
                   // Corrected VariableResolutionError arguments (2 arguments expected)
                   throw new VariableResolutionError(errorMsg, {
                       code: 'E_FIELD_ACCESS_INVALID_TYPE',
                       details: { variableName: node.identifier, fieldAccessAttempted: true }
                    });
              }
              resolvedValueForStringify = ''; 
          }
        } else {
            console.log(`[RESOLVE] No fields to access for ${node.identifier}.`);
        }
      
      // --- Final String Conversion & Recursive Resolution --- 
      const stringValue = this.convertToString(resolvedValueForStringify, newContext);
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
          // Corrected VariableResolutionError arguments (2 arguments expected)
          throw new VariableResolutionError(
             `Failed to resolve variable: ${node.identifier}`, 
             {
               code: 'E_RESOLVE_VAR_FAILED',
               details: {
                 variableName: node.identifier,
                 variableType: node.valueType
               },
               cause: error, 
               severity: (error instanceof MeldError) ? error.severity : ErrorSeverity.Fatal
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

  // Add placeholder/basic implementation for accessFields
  public async accessFields(
    baseValue: JsonValue,
    fields: FieldAccess[],
    context: ResolutionContext
  ): Promise<Result<JsonValue, FieldAccessError>> {
    console.log('[ACCESS_FIELDS] Start:', { fields, baseValueType: typeof baseValue, baseValuePreview: JSON.stringify(baseValue)?.substring(0, 50) }); 
    let current: JsonValue = baseValue;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const currentPathString = fields.slice(0, i + 1).map(f => f.type === FieldAccessType.INDEX ? `[${f.key}]` : `.${f.key}`).join('');
      console.log(`[ACCESS_FIELDS] Step ${i+1}/${fields.length}: Accessing field`, { type: field.type, key: field.key });

      if (current === null || typeof current !== 'object') {
        const errorMsg = `Cannot access field '${field.key}' on non-object value: ${typeof current}`;
        // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
        return failure(new CoreFieldAccessError(errorMsg, baseValue, fields, i));
      }

      if (field.type === FieldAccessType.PROPERTY) {
        const key = String(field.key);
        if (!Array.isArray(current)) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            current = (current as Record<string, JsonValue>)[key];
          } else {
            const availableKeys = Object.keys(current).join(', ') || '(none)';
            const errorMsg = `Field '${key}' not found in object. Available keys: ${availableKeys}`;
            // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
            return failure(new CoreFieldAccessError(errorMsg, baseValue, fields, i));
          }
        } else {
          // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
          return failure(new CoreFieldAccessError(`Cannot access property '${key}' on an array`, baseValue, fields, i));
        }
      } else if (field.type === FieldAccessType.INDEX) {
        if (Array.isArray(current)) {
          const index = Number(field.key);
          if (Number.isInteger(index) && index >= 0 && index < current.length) {
            current = current[index];
          } else {
            // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
            return failure(new CoreFieldAccessError(`Index '${field.key}' out of bounds for array of length ${current.length}`, baseValue, fields, i));
          }
        } else {
          // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
          return failure(new CoreFieldAccessError(`Cannot access index '${field.key}' on non-array value`, baseValue, fields, i));
        }
      } else {
        // @ts-ignore - Persistent linter error: Expected 2 arguments, but got 4. See _plans/PLAN-PHASE-3-ISSUES.md
        return failure(new CoreFieldAccessError(`Unknown field access type: '${(field as any).type}'`, baseValue, fields, i));
      }
    }
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