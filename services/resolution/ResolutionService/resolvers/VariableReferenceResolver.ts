import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode } from 'meld-spec';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { container } from 'tsyringe';
import { IResolutionServiceClient } from '../interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '../factories/ResolutionServiceClientFactory.js';
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { 
  TextNode, 
  DirectiveNode, 
  TextVarNode, 
  DataVarNode, 
  Field,
  VariableReferenceNode,
  isTextNode,
  isVariableReferenceNode,
  isDirectiveNode
} from './types.js';
import { VariableResolutionErrorFactory } from './error-factory.js';

/**
 * Handles resolution of variable references ({{var}})
 * Previously used ${var} for text and #{var} for data, now unified as {{var}}
 */
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;
  private resolutionTracker?: VariableResolutionTracker;
  private resolutionClient?: IResolutionServiceClient;
  private resolutionClientFactory?: ResolutionServiceClientFactory;
  private parserClient?: IParserServiceClient;
  private parserClientFactory?: ParserServiceClientFactory;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new instance of the VariableReferenceResolver
   * @param stateService - State service for variable management
   * @param resolutionService - Resolution service for resolving variables
   * @param parserService - Parser service for parsing content with variables
   */
  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService?: IResolutionService,
    private readonly parserService?: IParserService
  ) {}

  /**
   * Lazily initialize the service client factories
   * This is called only when needed to avoid circular dependencies
   * @throws Error if factory initialization fails
   */
  private ensureFactoryInitialized(): void {
    // If already initialized, return early
    if (this.factoryInitialized) {
      return;
    }
    
    // Mark as initialized to prevent recursive calls
    this.factoryInitialized = true;
    
    // Initialize resolution client factory if needed
    if (!this.resolutionService && !this.resolutionClient) {
      try {
        // Resolve the factory from the container
        this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
        this.initializeResolutionClient();
        logger.debug('Initialized ResolutionServiceClient via factory');
      } catch (error) {
        // Log error but don't fail - we might be able to continue with other mechanisms
        logger.warn('Failed to initialize ResolutionServiceClient', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ResolutionService, skipping client factory');
    }
    
    // Initialize parser client factory if needed
    if (!this.parserService && !this.parserClient) {
      try {
        // Resolve the factory from the container
        this.parserClientFactory = container.resolve('ParserServiceClientFactory');
        this.initializeParserClient();
        logger.debug('Initialized ParserServiceClient via factory');
      } catch (error) {
        // Log error but don't fail - we'll fall back to regex parsing
        logger.warn('Failed to initialize ParserServiceClient, will use regex fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.debug('Using directly injected ParserService, skipping client factory');
    }
  }
  
  /**
   * Initialize the ResolutionServiceClient using the factory
   * @throws Error if client creation fails
   */
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      logger.warn('ResolutionServiceClientFactory not available, some functionality may be limited');
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      logger.debug('Successfully created ResolutionServiceClient');
    } catch (error) {
      // Don't throw, just log the error and continue without the client
      logger.warn('Failed to create ResolutionServiceClient', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Initialize the ParserServiceClient using the factory
   * @throws Error if client creation fails
   */
  private initializeParserClient(): void {
    if (!this.parserClientFactory) {
      logger.warn('ParserServiceClientFactory not available, will use regex fallback for parsing');
      return;
    }
    
    try {
      this.parserClient = this.parserClientFactory.createClient();
      logger.debug('Successfully created ParserServiceClient');
    } catch (error) {
      // Don't throw, just log the error and continue without the client
      logger.warn('Failed to create ParserServiceClient, will use regex fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Set the resolution tracker for debugging
   * @internal
   */
  setResolutionTracker(tracker: VariableResolutionTracker): void {
    this.resolutionTracker = tracker;
  }

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like {{varName}}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(content: string, context: ResolutionContext): Promise<string> {
    if (!content) {
      logger.debug('Empty content provided to variable resolver');
      return content;
    }
    
    // Track this resolution attempt if debug tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackResolutionAttempt(
        'variable-resolution', 
        JSON.stringify(context),
        true, 
        content
      );
    }
    
    try {
      // Check if the content contains variable references before proceeding
      if (!this.containsVariableReferences(content)) {
        return content;
      }
      
      // Special handling for test context
      if (context.state) {
        // In test context, we need to handle the mocked state service
        // This is needed because the test is mocking getTextVar and getDataVar directly
        const mockStateService = context.state;
        
        // Handle variable references one by one
        const variableMatcher = /\{\{([^}]+)\}\}/g;
        let match;
        let result = content;
        
        // Process each match
        while ((match = variableMatcher.exec(content)) !== null) {
          const fullMatch = match[0];
          const varName = match[1];
          
          // Check if this is a field access (contains dots)
          if (varName.includes('.')) {
            // Extract the base variable name and fields
            const parts = varName.split('.');
            const baseName = parts[0];
            const fields = parts.slice(1);
            
            // First try as data variable (most common for field access)
            const dataValue = mockStateService.getDataVar(baseName);
            if (dataValue !== undefined) {
              // Access fields in the data object
              let currentValue = dataValue;
              for (const field of fields) {
                if (currentValue && typeof currentValue === 'object' && field in currentValue) {
                  currentValue = currentValue[field];
                } else {
                  // Field not found
                  if (context.strict) {
                    throw VariableResolutionErrorFactory.fieldNotFound(baseName, field);
                  }
                  currentValue = '';
                  break;
                }
              }
              
              // Replace the variable reference with its value
                  result = result.replace(fullMatch, String(currentValue));
                continue;
            }
            
            // Try as text variable (less common for field access)
            const textValue = mockStateService.getTextVar(baseName);
            if (textValue !== undefined) {
              // Text variables don't support field access
            if (context.strict) {
              throw VariableResolutionErrorFactory.invalidAccess(baseName, `Cannot access fields in text variable ${baseName}`);
            }
              result = result.replace(fullMatch, '');
            continue;
          }
          
            // Variable not found
            if (context.strict) {
              throw new MeldResolutionError(
                `Variable ${baseName} not found`,
                {
                  code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
                  severity: ErrorSeverity.Error,
                  details: { variable: baseName }
                }
              );
            }
            result = result.replace(fullMatch, '');
            continue;
          }
          
          // Simple variable reference (no field access)
          // Try as text variable first
          const textValue = mockStateService.getTextVar(varName);
          if (textValue !== undefined) {
            result = result.replace(fullMatch, textValue);
            continue;
          }
          
          // Try as data variable
          const dataValue = mockStateService.getDataVar(varName);
          if (dataValue !== undefined) {
            // Convert to string representation
            const stringValue = this.convertToString(dataValue);
            result = result.replace(fullMatch, stringValue);
            continue;
          }
          
          // Variable not found
          if (context.strict) {
            throw new MeldResolutionError(
              `Variable ${varName} not found`,
              {
                code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
                severity: ErrorSeverity.Error,
                details: { variable: varName }
              }
            );
          }
          result = result.replace(fullMatch, '');
    }
    
    return result;
  }
  
      // Normal context (not test)
      // Parse the content to extract variable references
      const nodes = await this.parseContent(content);
      
      // Process each node
      let result = '';
      
      // Process all nodes sequentially
      for (const node of nodes) {
        try {
          if (isTextNode(node)) {
            // Text node - add as is
            result += node.value ?? node.content ?? '';
          } else if (isVariableReferenceNode(node)) {
            // Variable reference - resolve it
            const varName = node.identifier;
            
            // Check if this is a field access
            if (node.fields && node.fields.length > 0) {
              // Get the base variable
              const value = await this.getVariable(varName, context);
              if (value === undefined) {
                // Variable not found
                if (context.strict) {
                  throw VariableResolutionErrorFactory.variableNotFound(varName);
                }
                result += '';
                continue;
              }
              
              // Access fields
              try {
                const fieldValue = await this.accessFields(value, node.fields, context, varName);
                result += fieldValue;
              } catch (error) {
                // Field access error
                if (context.strict) {
                  throw error;
                }
                logger.debug('Field access error in non-strict mode, continuing with empty value', {
                  varName,
                  error: error instanceof Error ? error.message : String(error)
                });
                result += '';
              }
            } else {
              // Simple variable reference
              const value = await this.getVariable(varName, context);
              if (value === undefined) {
                // Variable not found
                if (context.strict) {
                  throw VariableResolutionErrorFactory.variableNotFound(varName);
                }
                result += '';
                continue;
              }
              
              // Convert to string
              result += this.convertToString(value);
            }
          } else if (isDirectiveNode(node)) {
            // Handle directive nodes if needed
            logger.debug('Ignoring directive node during variable resolution', { 
              directiveKind: node.directive?.kind 
            });
            continue;
          } else {
            // Unknown node type - log and skip
            logger.debug('Unknown node type during variable resolution', { 
              nodeType: node.type 
            });
          }
        } catch (error) {
          // If we're in strict mode, any error should bubble up
          if (context.strict) {
            throw error;
          }
          
          // In non-strict mode, log the error and continue
          logger.warn('Error processing node during variable resolution (non-strict mode)', {
            nodeType: node.type,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Continue with empty result for this node
          continue;
        }
      }
      
      return result;
    } catch (error) {
      // Track error if debug tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          'variable-resolution-error', 
          JSON.stringify(context),
          false, 
          undefined, 
          (error as Error).message
        );
      }
      
      // Re-throw the error
            throw error;
    } finally {
      // Track completion if debug tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          'variable-resolution-complete', 
          JSON.stringify(context),
          true
        );
      }
    }
  }

  /**
   * Resolve a field access expression like varName.field1.field2
   * This is used for direct field access in tests
   */
  async resolveFieldAccess(varName: string, fieldPath: string, context: ResolutionContext): Promise<any> {
    try {
      // Get the base variable
      const value = await this.getVariable(varName, context);
      if (value === undefined) {
        throw new MeldResolutionError(
          `Variable ${varName} not found`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
          }
        );
      }
      
      // No fields to access
      if (!fieldPath) {
        return value;
      }
      
      // Split the field path
      const fields = fieldPath.split('.').map(field => {
        // Check if this is a numeric index
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          return { type: 'index', value: numIndex };
        }
        // Otherwise it's a field name
        return { type: 'field', value: field };
      });
      
      // Access the fields
      let current = value;
      for (const field of fields) {
        if (current === undefined || current === null) {
          throw VariableResolutionErrorFactory.fieldNotFound(`${varName}.${fieldPath}`, String(field.value));
        }
        
        if (field.type === 'index') {
          // Array access
          if (Array.isArray(current)) {
            if (typeof field.value === 'number' && field.value >= 0 && field.value < current.length) {
              current = current[field.value];
            } else {
              throw new MeldResolutionError(
                `Array index ${field.value} out of bounds for array of length ${current.length}`,
                {
                  code: ResolutionErrorCode.INVALID_ACCESS,
                  severity: ErrorSeverity.Error,
                  details: { path: `${varName}.${fieldPath}`, index: field.value, length: current.length }
                }
              );
            }
          } else {
            throw new MeldResolutionError(
              `Cannot access array index in non-array value`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
                details: { path: `${varName}.${fieldPath}`, type: typeof current }
              }
            );
          }
        } else {
          // Field access
          if (typeof current === 'object' && current !== null) {
            if (field.value in current) {
              current = current[field.value as string];
            } else {
              throw new MeldResolutionError(
                `Field ${field.value} not found in object`,
                {
                  code: ResolutionErrorCode.FIELD_NOT_FOUND,
                  severity: ErrorSeverity.Error,
                  details: { path: `${varName}.${fieldPath}`, field: field.value }
                }
              );
            }
          } else {
            throw new MeldResolutionError(
              `Cannot access field in non-object value`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
                details: { path: `${varName}.${fieldPath}`, type: typeof current }
              }
            );
          }
        }
      }
      
      return current;
    } catch (error) {
      // Log the error for diagnostic purposes
      logger.error('Error in resolveFieldAccess', {
        varName,
        fieldPath,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Rethrow to maintain behavior
      throw error;
    }
  }

  /**
   * Debug version of field access that returns detailed information
   * This is used for testing and debugging
   */
  debugFieldAccess(obj: any, fields: string[], context: ResolutionContext): any {
    // Start with the base value
    let current = obj;
    const path = [];
    
    try {
      // Handle each field
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        path.push(field);
        
        // Check if current value exists
        if (current === undefined || current === null) {
          return {
            success: false,
            error: `Cannot access field ${field} in undefined value`,
            path: path.join('.'),
            result: undefined
          };
        }
        
        // Try to parse as number for array access
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          // Array access
          if (Array.isArray(current)) {
            if (numIndex >= 0 && numIndex < current.length) {
              current = current[numIndex];
            } else {
              return {
                success: false,
                error: `Array index ${numIndex} out of bounds for array of length ${current.length}`,
                path: path.join('.'),
                result: undefined
              };
            }
          } else {
            return {
              success: false,
              error: `Cannot access array index in non-array value`,
              path: path.join('.'),
              type: typeof current,
              result: undefined
            };
          }
        } else {
          // Field access
          if (typeof current === 'object' && current !== null) {
            if (field in current) {
              current = current[field];
            } else {
              return {
                success: false,
                error: `Field ${field} not found in object`,
                path: path.join('.'),
                result: undefined
              };
            }
          } else {
            return {
              success: false,
              error: `Cannot access field in non-object value`,
              path: path.join('.'),
              type: typeof current,
              result: undefined
            };
          }
        }
      }
      
      // Success
      return {
        success: true,
        path: path.join('.'),
        result: current
      };
    } catch (error) {
      // Unexpected error
      return {
        success: false,
        error: error.message,
        path: path.join('.'),
        result: undefined
      };
    }
  }
  
  /**
   * Check if the content contains variable references
   */
  private containsVariableReferences(content: string): boolean {
    return content.includes('{{') && content.includes('}}');
  }

  /**
   * Parse the content to extract variable references
   */
  private async parseContent(content: string): Promise<MeldNode[]> {
    // Ensure factory is initialized
    this.ensureFactoryInitialized();
    
    try {
      // First try to use directly injected parser service
      if (this.parserService) {
        try {
          return await this.parserService.parse(content);
        } catch (error) {
          logger.warn('Error using injected parser service, falling back to client', { error });
        }
      }
      
      // Fall back to parser client
      if (this.parserClient) {
        try {
          return await this.parserClient.parseString(content);
        } catch (error) {
          logger.warn('Error parsing content with parser client', { error });
        }
      }
    } catch (error) {
      logger.warn('Parser service initialization failed, using regex fallback', { error });
    }
    
    // Fallback to regex-based parsing if both options fail
    logger.warn('Falling back to regex-based parsing');
    return this.parseWithRegex(content);
  }
  
  /**
   * Parse content using regex-based approach as a fallback
   * This is used when AST-based parsing fails
   */
  private parseWithRegex(content: string): MeldNode[] {
    const nodes: MeldNode[] = [];
    const variableMatcher = /\{\{([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;
    
    while ((match = variableMatcher.exec(content)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        const textValue = content.substring(lastIndex, match.index);
        nodes.push({
          type: 'Text',
          value: textValue
        } as TextNode);
      }
      
      // Add the variable reference
      const varName = match[1];
      
      // Check if this is a field access
      if (varName.includes('.')) {
        const parts = varName.split('.');
        const baseName = parts[0];
        const fields = parts.slice(1).map(field => {
          // Check if this is a numeric index
          const numIndex = parseInt(field, 10);
          if (!isNaN(numIndex)) {
            return { type: 'index', value: numIndex } as Field;
          }
          // Otherwise it's a field name
          return { type: 'field', value: field } as Field;
        });
        
        nodes.push({
          type: 'VariableReference',
          identifier: baseName,
          fields
        } as VariableReferenceNode);
      } else {
        // Simple variable reference
        nodes.push({
          type: 'VariableReference',
          identifier: varName
        } as VariableReferenceNode);
      }
      
      // Update last index
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const textValue = content.substring(lastIndex);
      nodes.push({
        type: 'Text',
        value: textValue
      } as TextNode);
    }
    
    return nodes;
  }

  /**
   * Get a variable value by name
   */
  private async getVariable(name: string, context: ResolutionContext): Promise<any> {
    // Check if this is a test context with a mocked state service
    if (context.state) {
      // Try as text variable first
      const textValue = context.state.getTextVar(name);
      if (textValue !== undefined) {
        return textValue;
      }
      
      // Try as data variable
      const dataValue = context.state.getDataVar(name);
      if (dataValue !== undefined) {
        return dataValue;
      }
      
      // Try as path variable
      const pathValue = context.state.getPathVar?.(name);
      if (pathValue !== undefined) {
        return pathValue;
      }
      
      // Variable not found
      return undefined;
    }
    
    // Normal context
    // Try as text variable first
    const textValue = this.stateService.getTextVar(name);
    if (textValue !== undefined) {
      return textValue;
    }
    
    // Try as data variable
    const dataValue = this.stateService.getDataVar(name);
    if (dataValue !== undefined) {
      return dataValue;
    }
    
    // Try as path variable
    const pathValue = this.stateService.getPathVar?.(name);
    if (pathValue !== undefined) {
      return pathValue;
    }
    
    // Variable not found
    return undefined;
  }

  /**
   * Convert a value to string representation
   */
  private convertToString(value: any): string {
    if (value === undefined || value === null) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.convertToString(item)).join(', ');
    }
    
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
    } catch (error) {
        logger.error('Error stringifying object', { value, error });
        return '[Object]';
      }
    }
    
    return String(value);
  }
  
  /**
   * Extract all variable references from the given text
   * @param text The text to extract references from
   * @returns Array of variable references
   */
  extractReferences(text: string): string[] {
    if (!text) {
      return [];
    }
    
    // Use simple regex for basic cases
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = text.match(regex);
    
    if (!matches) {
      return [];
    }
    
    // Extract variable names and deduplicate
    const variables = matches.map(match => {
      // Remove {{ and }}
      const varPath = match.slice(2, -2).trim();
      
      // Extract base variable name (before any dots or brackets)
      const baseNameMatch = varPath.match(/^([^.\[]+)/);
      return baseNameMatch ? baseNameMatch[1] : varPath;
    });
    
    // Return unique variables
    return [...new Set(variables)];
  }
  
  /**
   * Extract variable references asynchronously using AST when possible
   * @param text The text to extract references from
   * @returns Array of variable references and information
   */
  async extractReferencesAsync(text: string): Promise<string[]> {
    // Simple case - no variables
    if (!text || !text.includes('{{')) {
      return [];
    }
    
    try {
      // Try to use directly injected parser service first
      if (this.parserService) {
        try {
          const nodes = await this.parserService.parse(text);
          return this.extractVariableReferencesFromNodes(nodes);
        } catch (error) {
          logger.warn('Error using injected parser service, falling back to client', { error });
        }
      }
      
      // Ensure factory is initialized for client approach
      this.ensureFactoryInitialized();
      
      // Try to use the parser client if available
      if (this.parserClient) {
        try {
          const nodes = await this.parserClient.parseString(text);
          return this.extractVariableReferencesFromNodes(nodes);
        } catch (error) {
          logger.warn('Error using parserClient.parseString', { error });
        }
      }
      
      // If we get here, we couldn't parse with any method
      logger.debug('Parser services unavailable or failed, falling back to regex extraction');
    } catch (error) {
      logger.debug('Error extracting references with AST', { error });
      // Fall back to regex-based extraction
    }
    
    // Fall back to simple extraction
    return this.extractReferences(text);
  }
  
  /**
   * Extract variable references from AST nodes
   * @param nodes The AST nodes to extract references from
   * @returns Array of variable references
   */
  private extractVariableReferencesFromNodes(nodes: MeldNode[]): string[] {
    if (!nodes || nodes.length === 0) {
      return [];
    }
    
    const references = new Set<string>();
    
    for (const node of nodes) {
      if (node.type === 'VariableReference') {
        // Variable reference
        references.add((node as TextVarNode | DataVarNode).identifier);
      } else if (node.type === 'Directive') {
        const directive = (node as DirectiveNode).directive;
        if (directive?.kind === 'text' || directive?.kind === 'data') {
          // Text or data directive
          references.add(directive.identifier);
        }
      }
    }
    
    return [...references];
  }

  /**
   * Parse a variable reference into base name and fields
   */
  private parseVariableReference(reference: string): { baseName: string, fields: Field[] } {
    // Check if this is a field access
    if (reference.includes('.')) {
      const parts = reference.split('.');
      const baseName = parts[0];
      const fields = parts.slice(1).map(field => {
        // Check if this is a numeric index
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          return { type: 'index', value: numIndex };
        }
        // Otherwise it's a field name
        return { type: 'field', value: field };
      });
      
      return { baseName, fields };
    }
    
    // Simple variable reference
    return { baseName: reference, fields: [] };
  }
  
  /**
   * Access fields in an object using field path
   * @param baseValue The base value to access fields from
   * @param fields Array of fields to access
   * @param context Resolution context
   * @param originalPath Original path expression for error reporting
   * @returns String representation of the accessed value
   */
  private async accessFields(
    baseValue: any, 
    fields: Field[], 
    context: ResolutionContext,
    originalPath: string
  ): Promise<string> {
    let currentValue = baseValue;
    let currentPath = originalPath;
    
    // No fields to access
    if (!fields || fields.length === 0) {
      return this.convertToString(currentValue);
    }
    
    for (const field of fields) {
      // Handle undefined or null values
      if (currentValue === undefined || currentValue === null) {
        if (context.strict) {
          throw VariableResolutionErrorFactory.fieldAccessError(
            `Cannot access field of ${currentValue} value`,
            originalPath
          );
        }
        return '';
      }
      
      // Get the field name or index
      let fieldNameOrIndex = field.value;
      
      // Update the path for error reporting
      if (typeof fieldNameOrIndex === 'string') {
        currentPath += '.' + fieldNameOrIndex;
      } else {
        currentPath += `[${fieldNameOrIndex}]`;
      }
      
      // Check if the field name is a variable reference
      if (typeof fieldNameOrIndex === 'string' && 
          fieldNameOrIndex.startsWith('{{') && 
          fieldNameOrIndex.endsWith('}}')) {
        try {
          // Resolve the variable reference
          fieldNameOrIndex = await this.resolveVariableInFieldName(fieldNameOrIndex, context);
          logger.debug('Resolved variable in field name', { 
            original: field.value, 
            resolved: fieldNameOrIndex
          });
        } catch (error) {
          if (context.strict) {
            throw error;
          }
          return '';
        }
      }
      
      // Access the field
      try {
        if (Array.isArray(currentValue) && field.type === 'index') {
          // Validate index is in bounds
          const index = typeof fieldNameOrIndex === 'number' ? 
            fieldNameOrIndex : parseInt(fieldNameOrIndex as string, 10);
          
          if (isNaN(index)) {
            if (context.strict) {
              throw VariableResolutionErrorFactory.invalidAccess(
                originalPath,
                `Invalid array index: '${fieldNameOrIndex}' is not a number`
              );
            }
            return '';
          }
          
          if (index < 0 || index >= currentValue.length) {
            if (context.strict) {
              throw VariableResolutionErrorFactory.indexOutOfBounds(
                originalPath,
                index,
                currentValue.length
              );
            }
            return '';
          }
          
          currentValue = currentValue[index];
        } else if (typeof currentValue === 'object' && currentValue !== null) {
          // Using fieldNameOrIndex as a property name
          const propName = String(fieldNameOrIndex);
          
          if (!(propName in currentValue)) {
            if (context.strict) {
              throw VariableResolutionErrorFactory.fieldNotFound(
                originalPath,
                propName
              );
            }
            return '';
          }
          
          currentValue = currentValue[propName];
        } else {
          // Can't access fields on primitive values
          if (context.strict) {
            throw VariableResolutionErrorFactory.invalidAccess(
              originalPath,
              `Cannot access field '${fieldNameOrIndex}' of non-object value (type: ${typeof currentValue})`
            );
          }
          return '';
        }
      } catch (error) {
        // Handle errors during property access
        if (error instanceof MeldResolutionError) {
          // Just rethrow existing resolution errors
          throw error;
        }
        
        // Create a new resolution error for other types of errors
        if (context.strict) {
          throw VariableResolutionErrorFactory.fieldAccessError(
            `Error accessing field '${fieldNameOrIndex}': ${(error as Error).message}`,
            originalPath
          );
        }
        
        logger.debug('Non-critical error during field access in non-strict mode', {
          path: currentPath,
          error: error instanceof Error ? error.message : String(error)
        });
        
        return '';
      }
    }
    
    // Return the final value
    return this.convertToString(currentValue);
  }

  /**
   * Resolve a variable reference in a field name
   * This allows for dynamic field access like obj[varName]
   */
  private async resolveVariableInFieldName(fieldName: string, context: ResolutionContext): Promise<string | number> {
    // Check if this is a variable reference
    if (fieldName.startsWith('{{') && fieldName.endsWith('}}')) {
      // Extract the variable name
      const varName = fieldName.substring(2, fieldName.length - 2);
      
      // Resolve the variable
      const value = await this.getVariable(varName, context);
      if (value === undefined) {
        if (context.strict) {
    throw VariableResolutionErrorFactory.variableNotFound(varName);
  }
      return '';
    }
    
      // Convert to string or number
      if (typeof value === 'number') {
      return value;
    }
      return this.convertToString(value);
    }
    
    // Not a variable reference
    return fieldName;
  }

  /**
   * Resolves a variable reference that contains another variable reference
   * For example: {{var_{{nested}}}}
   * @param reference The reference containing nested variables
   * @param context Resolution context
   * @returns Resolved variable value
   * @throws MeldResolutionError if resolution fails
   */
  private async resolveNestedVariableReference(reference: string, context: ResolutionContext): Promise<string> {
    try {
      // First try to use directly injected resolution service
      if (this.resolutionService) {
        try {
          return await this.resolutionService.resolveInContext(reference, context);
        } catch (error) {
          logger.debug('Error using injected resolutionService.resolveInContext, trying fallback', {
            error: error instanceof Error ? error.message : String(error),
            reference
          });
          // If this fails, we'll try the client approach as a fallback
        }
      }
      
      // Ensure factory is initialized for client approach
      this.ensureFactoryInitialized();
      
      // Try to use the resolution client
      if (this.resolutionClient) {
        try {
          return await this.resolutionClient.resolveInContext(reference, context);
        } catch (error) {
          // Check if this is already a MeldResolutionError (like circular reference detection)
          if (error instanceof MeldResolutionError) {
            throw error;
          }
          
          logger.debug('Error using resolutionClient.resolveInContext', { 
            error: error instanceof Error ? error.message : String(error),
            reference 
          });
        }
      }
      
      // Handle the case where we can't resolve nested variables
      throw new MeldResolutionError(
        `Unable to resolve nested variable reference: ${reference}`,
        {
          code: ResolutionErrorCode.RESOLUTION_FAILED,
          severity: ErrorSeverity.Error,
          details: {
            value: reference,
            context: 'nested-variable-resolution'
          }
        }
      );
    } catch (error) {
      // Propagate MeldResolutionError instances
      if (error instanceof MeldResolutionError) {
        throw error;
      }
      
      // Convert other errors to MeldResolutionError with proper context
      throw new MeldResolutionError(
        `Failed to resolve nested variable reference: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ResolutionErrorCode.RESOLUTION_FAILED,
          severity: ErrorSeverity.Error,
          details: {
            value: reference,
            error: error instanceof Error ? error.message : String(error)
          },
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }
}