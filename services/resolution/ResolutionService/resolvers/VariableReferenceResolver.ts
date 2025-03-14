import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, DirectiveNode, NodeType } from '@core/syntax/types';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { container } from 'tsyringe';
import { IResolutionServiceClient } from '../interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '../factories/ResolutionServiceClientFactory.js';
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { 
  VariableReferenceNode,
  VariableType,
  Field,
  isVariableReferenceNode,
  createVariableReferenceNode
} from '@core/syntax/types/variables';
import { VariableResolutionErrorFactory } from './error-factory.js';

// Type guard functions
function isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text' && 'content' in node;
}

function isDirectiveNode(node: MeldNode): node is DirectiveNode {
  return node.type === 'Directive' && 'directive' in node;
}

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
      
      // Parse the content into nodes
      const nodes = await this.parseContent(content);
      
      // Process each node
      let result = '';
      
      // Process all nodes sequentially
      for (const node of nodes) {
        try {
          if (isTextNode(node)) {
            // Text node - add content as is
            result += node.content;
          } else if (isVariableReferenceNode(node)) {
            // Get variable information based on node type
            const varName = node.identifier;
            let varType: string;
            let fields: any[] | undefined;
            
            // Handle both new VariableReference and legacy variable nodes
            if (node.type === 'VariableReference') {
              varType = node.valueType;
              fields = node.fields;
            } else if (node.type === 'TextVar') {
              varType = 'text';
              fields = node.fields;
            } else if (node.type === 'DataVar') {
              varType = 'data';
              fields = node.fields;
            } else if (node.type === 'PathVar') {
              varType = 'path';
              fields = undefined;
            } else {
              // Should never happen due to isVariableReferenceNode check
              logger.warn('Unknown variable node type', { nodeType: node.type });
              if (context.strict) {
                throw new MeldResolutionError(
                  `Unknown variable node type: ${node.type}`,
                  {
                    code: ResolutionErrorCode.INVALID_NODE_TYPE,
                    severity: ErrorSeverity.Fatal,
                    details: { 
                      type: node.type,
                      value: content,
                      context: JSON.stringify(context)
                    }
                  }
                );
              }
              continue;
            }
            
            // Get variable value
            const value = await this.getVariable(varName, context);
            
            // Handle undefined variables
            if (value === undefined) {
              logger.debug(`Variable '${varName}' not found`);
              
              // For strict mode, throw an error
              if (context.strict) {
                throw VariableResolutionErrorFactory.variableNotFound(varName);
              }
              
              // For non-strict mode, just use empty string
              result += '';
              continue;
            }
            
            // Check if this is a field access
            if (fields && fields.length > 0) {
              try {
                const fieldValue = await this.accessFields(value, fields, context, varName);
                result += this.convertToString(fieldValue);
              } catch (error) {
                // For strict mode, rethrow the error
                if (context.strict) {
                  throw error;
                }
                
                // For non-strict mode, log and continue with empty string
                logger.warn('Error accessing fields', {
                  variable: varName,
                  fields,
                  error: error instanceof Error ? error.message : String(error)
                });
                result += '';
              }
            } else {
              // Simple variable reference without fields
              result += this.convertToString(value);
            }
          } else {
            // Unknown node type - skip
            logger.warn('Unknown node type in variable resolution', { node });
            if (context.strict) {
              throw new MeldResolutionError(
                `Unknown node type: ${node.type}`,
                {
                  code: ResolutionErrorCode.INVALID_NODE_TYPE,
                  severity: ErrorSeverity.Fatal,
                  details: { 
                    type: node.type,
                    value: content,
                    context: JSON.stringify(context)
                  }
                }
              );
            }
          }
        } catch (error) {
          // Handle errors for individual nodes
          if (context.strict) {
            throw error;
          }
          logger.warn('Error processing node in variable resolution', { 
            node, 
            error: error instanceof Error ? error.message : String(error)
          });
          result += '';
        }
      }
      
      return result;
    } catch (error) {
      // Log the error for diagnostic purposes
      logger.error('Error in variable resolution', {
        content,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Track resolution error if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          'variable-resolution-error',
          JSON.stringify({
            content,
            context: JSON.stringify(context)
          }),
          false,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      
      // Rethrow to maintain behavior
      throw error;
    }
  }

  /**
   * Resolve a field access expression like varName.field1.field2
   * Enhanced version with type preservation options
   * 
   * @param varName Base variable name
   * @param fieldPath Dot-notation field path (e.g., "field1.field2")
   * @param context Resolution context
   * @param preserveType Whether to preserve the type of the result (vs. string conversion)
   * @returns Resolved field value (type preserved if preserveType is true)
   */
  async resolveFieldAccess(
    varName: string, 
    fieldPath: string, 
    context: ResolutionContext,
    preserveType: boolean = false
  ): Promise<any> {
    try {
      // Get the base variable
      const value = await this.getVariable(varName, context);
      if (value === undefined) {
        throw VariableResolutionErrorFactory.variableNotFound(varName);
      }
      
      // No fields to access - return base variable
      if (!fieldPath) {
        // If preserveType is false, convert to string
        if (!preserveType) {
          return this.convertToString(value);
        }
        return value;
      }
      
      // Split the field path
      const fields = fieldPath.split('.').map(field => {
        // Check if this is a numeric index
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          return { type: 'index' as const, value: numIndex };
        }
        // Otherwise it's a field name
        return { type: 'field' as const, value: field };
      });
      
      // Access the fields
      // Use the internal accessFields method with proper error handling
      const result = await this.accessFields(value, fields, context, varName);
      
      // If preserveType is false, convert to string
      if (!preserveType) {
        return this.convertToString(result);
      }
      
      // Otherwise return the raw value with deep cloning to preserve type
      if (result !== null && result !== undefined) {
        if (Array.isArray(result)) {
          return [...result]; // Return a copy of the array
        } else if (typeof result === 'object') {
          return { ...result as Record<string, unknown> }; // Return a copy of the object
        }
      }
      
      return result;
    } catch (error) {
      // Log the error for diagnostic purposes
      logger.error('Error in resolveFieldAccess', {
        varName,
        fieldPath,
        preserveType,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Track resolution error if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          'field-access-error',
          JSON.stringify({
            varName,
            fieldPath,
            preserveType,
            context: JSON.stringify(context)
          }),
          false,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      
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
        error: error instanceof Error ? error.message : String(error),
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
    // Try to use parser service first
    if (this.parserService) {
      try {
        return await this.parserService.parse(content);
      } catch (error) {
        logger.debug('Error using parser service, falling back to regex', { error });
      }
    }
    
    // Try parser client if available
    if (this.parserClient) {
      try {
        return await this.parserClient.parseString(content);
      } catch (error) {
        logger.debug('Error using parser client, falling back to regex', { error });
      }
    }
    
    // Fall back to regex parsing
    return this.parseWithRegex(content);
  }
  
  /**
   * Parse content using regex-based approach as a fallback
   * This is used when AST-based parsing fails
   */
  private parseWithRegex(content: string): MeldNode[] {
    const nodes: MeldNode[] = [];
    let lastIndex = 0;
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = variableRegex.exec(content)) !== null) {
      // Add text before the variable if any
      if (match.index > lastIndex) {
        nodes.push({
          type: 'Text',
          content: content.slice(lastIndex, match.index)
        } as TextNode);
      }

      // Parse the variable reference
      const { baseName, fields } = this.parseVariableReference(match[1]);
      
      // Determine if this is a data var (has fields) or text var (no fields)
      const valueType = fields && fields.length > 0 ? 'data' : 'text';
      nodes.push(createVariableReferenceNode(baseName, valueType, fields));

      lastIndex = match.index + match[0].length;
    }

    // Check for path variables ($var) as well
    const pathVarRegex = /\$([A-Za-z0-9_~]+)/g;
    while ((match = pathVarRegex.exec(content.slice(lastIndex))) !== null) {
      // Add text before the path variable if any
      const actualIndex = lastIndex + match.index;
      if (actualIndex > lastIndex) {
        nodes.push({
          type: 'Text',
          content: content.slice(lastIndex, actualIndex)
        } as TextNode);
      }

      // Create path variable node
      nodes.push(createVariableReferenceNode(match[1], 'path', undefined));
      
      lastIndex = actualIndex + match[0].length;
    }

    // Add remaining text if any
    if (lastIndex < content.length) {
      nodes.push({
        type: 'Text',
        content: content.slice(lastIndex)
      } as TextNode);
    }

    return nodes;
  }

  /**
   * Get a variable value by name
   */
  private async getVariable(name: string, context: ResolutionContext): Promise<any> {
    // First try as text variable
    const textValue = context.state.getTextVar(name);
    if (textValue !== undefined) {
      return textValue;
    }

    // Then try as data variable
    const dataValue = context.state.getDataVar(name);
    if (dataValue !== undefined) {
      return dataValue;
    }

    // Finally try as path variable
    const pathValue = context.state.getPathVar(name);
    if (pathValue !== undefined) {
      return pathValue;
    }

    // Variable not found
    if (context.strict) {
      throw VariableResolutionErrorFactory.variableNotFound(name);
    }
    return '';
  }

  /**
   * Convert a value to string representation with context-aware formatting
   * Public to allow use by client interfaces
   * 
   * @param value The value to convert to string
   * @param formattingContext Optional formatting context to control output format
   * @returns Formatted string representation
   */
  convertToString(
    value: any, 
    formattingContext?: { 
      isBlock?: boolean; 
      nodeType?: string; 
      linePosition?: 'start' | 'middle' | 'end';
      isTransformation?: boolean;
    }
  ): string {
    // Handle null and undefined
    if (value === null || value === undefined) {
      return '';
    }

    // Handle text nodes
    if (isTextNode(value)) {
      return value.content;
    }

    // Handle variable reference nodes
    if (isVariableReferenceNode(value)) {
      return value.identifier;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.convertToString(item, formattingContext)).join('\n');
    }

    // Handle objects
    if (typeof value === 'object') {
      // Special handling for block formatting
      if (formattingContext?.isBlock) {
        return JSON.stringify(value, null, 2);
      }
      return JSON.stringify(value);
    }

    // Handle primitives
    return String(value);
  }
  
  /**
   * Extract all variable references from the given text
   * @param text The text to extract references from
   * @returns Array of variable references
   */
  extractReferences(text: string): string[] {
    // Extract all variable references using regex
    const references = new Set<string>();
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = variableRegex.exec(text)) !== null) {
      const reference = match[1];
      // For field access, only include the base variable name
      const baseName = reference.split('.')[0];
      references.add(baseName);
    }
    
    return Array.from(references);
  }
  
  /**
   * Extract variable references asynchronously using AST when possible
   * @param text The text to extract references from
   * @returns Array of variable references and information
   */
  async extractReferencesAsync(text: string): Promise<string[]> {
    try {
      // Parse the text into nodes
      const nodes = await this.parseContent(text);
      return this.extractVariableReferencesFromNodes(nodes);
    } catch (error) {
      // Fall back to regex-based extraction
      logger.debug('Error parsing content for reference extraction, falling back to regex', { error });
      return this.extractReferences(text);
    }
  }
  
  /**
   * Extract variable references from AST nodes
   * @param nodes The AST nodes to extract references from
   * @returns Array of variable references
   */
  private extractVariableReferencesFromNodes(nodes: MeldNode[]): string[] {
    const references = new Set<string>();
    
    for (const node of nodes) {
      if (isVariableReferenceNode(node)) {
        references.add(node.identifier);
      }
    }
    
    return Array.from(references);
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
          return { type: 'index' as const, value: numIndex };
        }
        // Otherwise it's a field name
        return { type: 'field' as const, value: field };
      }) as Field[];
      
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
    // Check if the field name contains variable references
    if (fieldName.includes('{{')) {
      // Resolve any variable references in the field name
      const resolvedName = await this.resolve(fieldName, context);
      
      // Try to convert to number if it looks like an array index
      const numIndex = parseInt(resolvedName, 10);
      if (!isNaN(numIndex)) {
        return numIndex;
      }
      
      return resolvedName;
    }
    
    // No variables to resolve
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
          if (this.resolutionClient.resolveInContext) {
            return await this.resolutionClient.resolveInContext(reference, context);
          }
          // Fallback to regular resolveVariables
          return await this.resolutionClient.resolveVariables(reference, context);
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
      
      // If all else fails, try to resolve directly
      const nodes = await this.parseContent(reference);
      if (nodes.length === 1 && isVariableReferenceNode(nodes[0])) {
        const node = nodes[0] as any; // Cast to any to avoid type errors
        const varName = node.identifier;
        
        // Get variable value
        const value = await this.getVariable(varName, context);
        if (value === undefined) {
          if (context.strict) {
            throw VariableResolutionErrorFactory.variableNotFound(varName);
          }
          return '';
        }
        
        // Handle fields access for both new and legacy node types
        if ((node.type === 'VariableReference' && node.fields && node.fields.length > 0) ||
            (node.type === 'DataVar' && node.fields && node.fields.length > 0) ||
            (node.type === 'TextVar' && node.fields && node.fields.length > 0)) {
          const fields = node.fields;
          try {
            const fieldValue = await this.accessFields(value, fields, context, varName);
            return this.convertToString(fieldValue);
          } catch (error) {
            if (context.strict) {
              throw error;
            }
            return '';
          }
        }
        
        return this.convertToString(value);
      }
      
      // Not a variable reference
      return reference;
    } catch (error) {
      // Log the error for diagnostic purposes
      logger.error('Error in resolveNestedVariableReference', {
        reference,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Track resolution error if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          'nested-variable-resolution-error',
          JSON.stringify({
            reference,
            context: JSON.stringify(context)
          }),
          false,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      
      throw error;
    }
  }
}
