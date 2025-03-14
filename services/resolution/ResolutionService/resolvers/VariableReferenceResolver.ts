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

// Define a format context type
type FormatContext = 'inline' | 'block';

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
    logger.debug(`Resolving content: ${content}`, {
      contextStrict: context.strict,
      allowedTypes: context.allowedVariableTypes
    });
    
    // If content doesn't contain variable references, return as is
    if (!this.containsVariableReferences(content)) {
      logger.debug('Content contains no variable references, returning as is');
      return content;
    }

    // Parse the content to extract variable references
    let nodes: MeldNode[];
    try {
      nodes = await this.parseContent(content);
      logger.debug(`Parsed content into ${nodes.length} nodes`);
    } catch (error) {
      logger.warn('Failed to parse content with AST parser, falling back to regex', {
        error: error instanceof Error ? error.message : String(error),
        content
      });
      // Fall back to regex-based parsing
      nodes = this.parseWithRegex(content);
      logger.debug(`Parsed content with regex into ${nodes.length} nodes`);
    }

    // Process each node
    let result = '';
    let iterations = 0;
    
    // Track resolution depth to prevent infinite recursion
    const resolutionDepth = (context as any).resolutionDepth || 0;
    if (resolutionDepth > this.MAX_RESOLUTION_DEPTH) {
      throw new MeldResolutionError(
        `Maximum resolution depth exceeded (${this.MAX_RESOLUTION_DEPTH})`,
        {
          code: ResolutionErrorCode.MAX_DEPTH_EXCEEDED,
          severity: ErrorSeverity.Fatal,
          details: { context: JSON.stringify(context) }
        }
      );
    }
    
    // Create a new context with incremented depth
    const newContext: ResolutionContext = {
      ...context,
      resolutionDepth: resolutionDepth + 1
    } as ResolutionContext & { resolutionDepth: number };

    // Process each node
    for (const node of nodes) {
      // Prevent infinite loops
      if (iterations++ > this.MAX_ITERATIONS) {
        throw new MeldResolutionError(
          `Maximum iterations exceeded (${this.MAX_ITERATIONS})`,
          {
            code: ResolutionErrorCode.MAX_ITERATIONS_EXCEEDED,
            severity: ErrorSeverity.Fatal,
            details: { context: JSON.stringify(context) }
          }
        );
      }

      // Process text nodes directly
      if (isTextNode(node)) {
        result += node.content;
        continue;
      }

      // Process variable reference nodes
      if (isVariableReferenceNode(node)) {
        logger.debug(`Processing variable reference node: ${node.identifier}`, {
          valueType: node.valueType,
          hasFields: !!node.fields,
          fields: node.fields ? JSON.stringify(node.fields) : 'none'
        });
        
        try {
          // Get the variable value
          let value = await this.getVariable(node.identifier, newContext);
          
          // If the variable has fields, access them
          if (node.fields && node.fields.length > 0) {
            logger.debug(`Accessing fields for variable ${node.identifier}`, {
              fields: JSON.stringify(node.fields)
            });
            
            try {
              value = await this.accessFields(value, node.fields, newContext, node.identifier);
              logger.debug(`Field access result for ${node.identifier}:`, {
                valueType: typeof value,
                isArray: Array.isArray(value),
                value: typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value)
              });
            } catch (fieldError: any) {
              // In non-strict mode, return empty string for field access errors
              if (!newContext.strict) {
                logger.warn(`Field access error in non-strict mode, returning empty string: ${fieldError.message}`);
                value = '';
              } else {
                // In strict mode, rethrow the error
                throw fieldError;
              }
            }
          }
          
          // Convert the value to string
          const stringValue = this.convertToString(value);
          logger.debug(`Converted ${node.identifier} to string: ${stringValue}`);
          
          // Add to result
          result += stringValue;
        } catch (error) {
          // In non-strict mode, replace with empty string
          if (!newContext.strict) {
            logger.warn(`Error resolving variable ${node.identifier} in non-strict mode, using empty string`, {
              error: error instanceof Error ? error.message : String(error)
            });
            result += '';
          } else {
            // In strict mode, rethrow the error
            throw error;
          }
        }
        
        continue;
      }

      // Handle directive nodes (should not happen in normal operation)
      if (isDirectiveNode(node)) {
        logger.warn(`Unexpected directive node in variable resolution: ${node.directive.kind}`);
        // Skip directive nodes
        continue;
      }

      // Unknown node type
      logger.warn(`Unknown node type in variable resolution: ${node.type}`);
    }

    // If the result still contains variable references, resolve them recursively
    if (this.containsVariableReferences(result)) {
      logger.debug(`Result still contains variable references, resolving recursively: ${result}`);
      return this.resolve(result, newContext);
    }

    logger.debug(`Final resolved result: ${result}`);
    return result;
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
   * Get a variable value by name
   */
  private async getVariable(name: string, context: ResolutionContext): Promise<any> {
    logger.debug(`Getting variable '${name}'`, {
      variableName: name,
      contextStrict: context.strict,
      allowedTypes: context.allowedVariableTypes
    });
    
    // Track resolution attempt if tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackAttemptStart(name, 'getVariable');
    }
    
    // Check if this is a nested variable reference
    if (name.includes('{{')) {
      logger.debug(`Resolving nested variable reference: ${name}`);
      const result = await this.resolveNestedVariableReference('{{' + name + '}}', context);
      
      // Track the resolution result if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          name,
          'nested-variable-reference',
          result !== undefined,
          result,
          result === undefined ? 'Nested variable not found' : undefined
        );
      }
      
      return result;
    }

    // First try as text variable
    const textValue = context.state.getTextVar(name);
    if (textValue !== undefined) {
      logger.debug(`Found text variable '${name}'`, {
        value: typeof textValue === 'string' ? textValue : JSON.stringify(textValue),
        type: typeof textValue
      });
      
      // Track the resolution result if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          name,
          'text-variable',
          true,
          textValue,
          undefined
        );
      }
      
      return textValue;
    }

    // Then try as data variable - check if we're getting an actual object 
    // or a stringified object which can happen in some test cases
    let dataValue = context.state.getDataVar(name);
    if (dataValue !== undefined) {
      logger.debug(`Found data variable '${name}'`, {
        valueType: typeof dataValue,
        isArray: Array.isArray(dataValue),
        preview: typeof dataValue === 'object' ? JSON.stringify(dataValue).substring(0, 100) : String(dataValue),
        rawValue: dataValue
      });
      
      // If dataValue is a string but looks like JSON, try to parse it
      if (typeof dataValue === 'string' && 
          (dataValue.startsWith('{') || dataValue.startsWith('['))) {
        try {
          const parsedData = JSON.parse(dataValue);
          logger.debug(`Parsed JSON string data variable '${name}'`, {
            parsedType: typeof parsedData,
            isArray: Array.isArray(parsedData),
            parsedPreview: JSON.stringify(parsedData).substring(0, 100)
          });
          
          // Track the resolution result if tracking is enabled
          if (this.resolutionTracker) {
            this.resolutionTracker.trackResolutionAttempt(
              name,
              'data-variable-parsed-from-string',
              true,
              parsedData,
              undefined
            );
          }
          
          return parsedData;
        } catch (e) {
          // If parsing fails, just use the string value
          logger.debug(`Failed to parse data variable '${name}' as JSON, using as string`, {
            error: e instanceof Error ? e.message : String(e)
          });
          
          // Track the failed parsing if tracking is enabled
          if (this.resolutionTracker) {
            this.resolutionTracker.trackResolutionAttempt(
              name,
              'data-variable-parse-failed',
              true,
              dataValue,
              e instanceof Error ? e.message : String(e)
            );
          }
        }
      }
      
      // Track the resolution result if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          name,
          'data-variable',
          true,
          dataValue,
          undefined
        );
      }
      
      return dataValue;
    }

    // Finally try as path variable
    const pathValue = context.state.getPathVar(name);
    if (pathValue !== undefined) {
      logger.debug(`Found path variable '${name}'`, {
        value: typeof pathValue === 'string' ? pathValue : JSON.stringify(pathValue),
        type: typeof pathValue
      });
      
      // Track the resolution result if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          name,
          'path-variable',
          true,
          pathValue,
          undefined
        );
      }
      
      return pathValue;
    }

    // Variable not found - always throw in strict mode
    if (context.strict) {
      logger.warn(`Variable '${name}' not found and strict mode is enabled, throwing error`);
      
      // Track the failed resolution if tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolutionAttempt(
          name,
          'variable-not-found',
          false,
          undefined,
          `Variable '${name}' not found`
        );
      }
      
      throw VariableResolutionErrorFactory.variableNotFound(name);
    }
    
    logger.warn(`Variable '${name}' not found but strict mode is disabled, returning undefined`);
    
    // Track the missing variable in non-strict mode if tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackResolutionAttempt(
        name,
        'variable-not-found-non-strict',
        false,
        undefined,
        `Variable '${name}' not found`
      );
    }
    
    return undefined;  // Return undefined instead of '' to signal missing variable
  }

  /**
   * Convert a value to a string representation
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
    
    // Determine the formatting context
    const formatContext: FormatContext = formattingContext?.isBlock ? 'block' : 'inline';
    const formatOutput = formattingContext?.isBlock || 
                        formattingContext?.nodeType === 'embed' || 
                        !formattingContext; // Default to formatted output for direct reference

    // Delegate to the enhanced private method
    return this.formatValueAsString(value, formatOutput, formatContext);
  }

  /**
   * Convert a value to string representation with context-aware formatting
   * Private helper method used by convertToString
   * 
   * @param value The value to convert to string
   * @param formatOutput Whether to format the output (true for block format, false for inline)
   * @param formatContext Optional formatting context to control output format
   * @returns Formatted string representation
   */
  private formatValueAsString(value: any, formatOutput = false, formatContext: FormatContext = 'inline'): string {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }

    // Handle array values with standardized formatting
    if (Array.isArray(value)) {
      // Block context formatting (for multiline output)
      if (formatContext === 'block') {
        // For complex arrays that need pretty formatting
        if (this.shouldArrayBePrettyPrinted(value)) {
          return value.map(item => {
            const itemStr = this.formatValueAsString(item, formatOutput, 'inline');
            // Format each item as a bullet point
            return `- ${itemStr}`;
          }).join('\n');
        }
        
        // Simple arrays in block context get comma-space formatting
        return value.map(item => this.formatValueAsString(item, formatOutput, 'inline')).join(', ');
      }
      
      // Inline context - always use comma-space formatting
      return value.map(item => this.formatValueAsString(item, formatOutput, 'inline')).join(', ');
    }

    // Handle object values with standardized formatting
    if (typeof value === 'object') {
      try {
        // Block context formatting (for multiline output)
        if (formatContext === 'block') {
          // Use 2-space indentation for pretty printing
          return JSON.stringify(value, null, 2);
        }
        
        // Inline context - compact JSON without whitespace
        return JSON.stringify(value);
      } catch (error) {
        // Just in case JSON.stringify fails
        return '[Object]';
      }
    }

    // Default fallback for other types
    return String(value);
  }

  private shouldArrayBePrettyPrinted(arr: any[]): boolean {
    // Arrays should be pretty-printed if:
    // 1. They contain objects 
    // 2. They contain nested arrays
    // 3. They are longer than 5 items
    // 4. Any item is longer than 20 characters when stringified
    
    if (arr.length > 5) {
      return true;
    }
    
    return arr.some(item => {
      if (typeof item === 'object' && item !== null) {
        return true;
      }
      
      if (Array.isArray(item)) {
        return true;
      }
      
      const stringified = String(item);
      return stringified.length > 20;
    });
  }

  /**
   * Format a JSON string to be more readable in inline context
   * Ensures spaces after colons and commas
   */
  private formatJsonString(jsonStr: string): string {
    return jsonStr
      .replace(/,"/g, ', "')  // Add space after commas
      .replace(/:{/g, ': {')  // Add space after colons followed by object
      .replace(/:\[/g, ': [') // Add space after colons followed by array
      .replace(/":"/g, '": "'); // Add space after colon in key-value pairs
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
   * Access fields in a nested object
   */
  private async accessFields(obj: any, fields: any[], context: ResolutionContext, variableName: string): Promise<any> {
    let current = obj;
    
    // Try to parse stringified JSON if needed
    if (typeof current === 'string' && (current.startsWith('{') || current.startsWith('['))) {
      try {
        const parsed = JSON.parse(current);
        logger.debug(`Successfully parsed stringified JSON for variable '${variableName}'`, {
          originalType: 'string',
          parsedType: typeof parsed,
          isArray: Array.isArray(parsed)
        });
        current = parsed;
      } catch (error) {
        // Not valid JSON, continue with the string value
        logger.debug(`Failed to parse string as JSON for variable '${variableName}'`, {
          error: error instanceof Error ? error.message : String(error),
          value: current
        });
      }
    }
    
    // Log debug information to help with troubleshooting
    logger.debug(`Accessing fields for variable '${variableName}'`, {
      initialObjectType: typeof current,
      isArray: Array.isArray(current),
      rawValue: current,
      numFields: fields?.length,
      fields: JSON.stringify(fields)
    });
    
    // Track field access attempt if tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackAttemptStart(
        `${variableName}.fields`,
        'field-access',
        { 
          initialType: typeof current,
          isArray: Array.isArray(current),
          fields: JSON.stringify(fields)
        }
      );
    }
    
    // Process fields in order
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const fieldValue = field.value !== undefined ? field.value : field;
      const fieldType = field.type || 'field';
      const fieldPath = fields.slice(0, i + 1).map(f => 
        f.type === 'index' ? `[${f.value}]` : `.${f.value}`
      ).join('').replace(/^\./, '');
      
      // Make sure we have a valid object to access fields on
      if (current === null || current === undefined) {
        const errorMessage = `Cannot access field '${fieldValue}' of ${current} for variable '${variableName}'`;
        const detailedMessage = `Cannot access field '${fieldValue}' at path '${fieldPath}' because the parent value is ${current}`;
        logger.error(errorMessage, { fieldPath, parentValue: current });
        
        // Track the failed field access if tracking is enabled
        if (this.resolutionTracker) {
          this.resolutionTracker.trackResolutionAttempt(
            `${variableName}.${fieldValue}`,
            'field-access-null-undefined',
            false,
            undefined,
            detailedMessage
          );
        }
        
        throw VariableResolutionErrorFactory.invalidAccess(
          variableName,
          detailedMessage
        );
      }
      
      // Log debug information about the current field access
      logger.debug(`Processing field ${i}`, { 
        fieldType, 
        fieldValue,
        currentType: typeof current,
        isArray: Array.isArray(current),
        currentValue: current
      });
      
      // If current is not an object or array and we're trying to access a property, throw error
      if (typeof current !== 'object' && !Array.isArray(current)) {
        const errorMessage = `Cannot access field '${fieldValue}' of non-object value (type: ${typeof current}) for variable '${variableName}'`;
        const detailedMessage = `Cannot access field '${fieldValue}' at path '${fieldPath}' because the parent value is of type '${typeof current}' (${String(current).substring(0, 50)}${String(current).length > 50 ? '...' : ''})`;
        logger.error(errorMessage, { 
          fieldPath, 
          parentType: typeof current, 
          parentValue: current 
        });
        
        // Track the failed field access if tracking is enabled
        if (this.resolutionTracker) {
          this.resolutionTracker.trackResolutionAttempt(
            `${variableName}.${fieldValue}`,
            'field-access-non-object',
            false,
            undefined,
            detailedMessage
          );
        }
        
        throw VariableResolutionErrorFactory.invalidAccess(
          variableName,
          detailedMessage
        );
      }
      
      // Field access (regular property or array index)
      if (fieldType === 'index' && Array.isArray(current)) {
        // Array index access
        const index = typeof fieldValue === 'number' ? fieldValue : parseInt(fieldValue as string, 10);
        if (isNaN(index)) {
          const errorMessage = `Invalid array index: '${fieldValue}' is not a number for variable '${variableName}'`;
          const detailedMessage = `Invalid array index: '${fieldValue}' at path '${fieldPath}' is not a valid number`;
          logger.error(errorMessage, { fieldPath, fieldValue });
          
          // Track the failed field access if tracking is enabled
          if (this.resolutionTracker) {
            this.resolutionTracker.trackResolutionAttempt(
              `${variableName}[${fieldValue}]`,
              'field-access-invalid-index',
              false,
              undefined,
              detailedMessage
            );
          }
          
          throw VariableResolutionErrorFactory.invalidAccess(
            variableName,
            detailedMessage
          );
        }
        
        if (index < 0 || index >= current.length) {
          const errorMessage = `Array index ${index} out of bounds [0-${current.length-1}] for variable '${variableName}'`;
          const detailedMessage = `Array index ${index} at path '${fieldPath}' is out of bounds [0-${current.length-1}]`;
          logger.error(errorMessage, { fieldPath, index, arrayLength: current.length });
          
          // Track the failed field access if tracking is enabled
          if (this.resolutionTracker) {
            this.resolutionTracker.trackResolutionAttempt(
              `${variableName}[${index}]`,
              'field-access-index-out-of-bounds',
              false,
              undefined,
              detailedMessage
            );
          }
          
          throw VariableResolutionErrorFactory.indexOutOfBounds(
            variableName,
            index,
            current.length
          );
        }
        
        current = current[index];
        logger.debug(`Accessed array index ${index}`, { 
          resultType: typeof current,
          isResultArray: Array.isArray(current),
          value: current
        });
      } else {
        // Regular property access
        const propName = String(fieldValue);
        
        if (!(propName in current)) {
          // Check if we have a stringified JSON object that needs parsing
          if (typeof current === 'string' && (current.startsWith('{') || current.startsWith('['))) {
            try {
              const parsed = JSON.parse(current);
              if (propName in parsed) {
                logger.debug(`Found property '${propName}' in parsed JSON string`, {
                  parsedType: typeof parsed,
                  isArray: Array.isArray(parsed)
                });
                current = parsed;
                current = current[propName];
                continue;
              }
            } catch (error) {
              // Not valid JSON, continue with normal error handling
              logger.debug(`Failed to parse string as JSON for property access`, {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          const errorMessage = `Field '${propName}' not found in variable '${variableName}'`;
          const detailedMessage = `Field '${propName}' at path '${fieldPath}' not found in variable '${variableName}'`;
          const availableKeys = typeof current === 'object' && current !== null ? 
            Object.keys(current) : [];
          
          logger.error(errorMessage, { 
            fieldPath, 
            availableKeys,
            parentType: typeof current,
            parentValue: current
          });
          
          if (context.strict) {
            // Track the failed field access if tracking is enabled
            if (this.resolutionTracker) {
              this.resolutionTracker.trackResolutionAttempt(
                `${variableName}.${propName}`,
                'field-access-not-found',
                false,
                undefined,
                detailedMessage
              );
            }
            
            // Create a more detailed error message that includes available keys
            const keysInfo = availableKeys.length > 0 
              ? `Available keys: ${availableKeys.join(', ')}` 
              : 'No keys available';
            
            throw VariableResolutionErrorFactory.fieldNotFound(
              variableName,
              `${propName} (${keysInfo})`
            );
          } else {
            logger.warn(`Field '${propName}' not found in variable '${variableName}', returning empty string (strict mode off)`);
            
            // Track the failed field access in non-strict mode if tracking is enabled
            if (this.resolutionTracker) {
              this.resolutionTracker.trackResolutionAttempt(
                `${variableName}.${propName}`,
                'field-access-not-found-non-strict',
                false,
                '',
                detailedMessage
              );
            }
            
            return '';
          }
        }
        
        current = current[propName];
        logger.debug(`Accessed property ${propName}`, { 
          resultType: typeof current,
          isResultArray: Array.isArray(current),
          value: current
        });
      }
    }
    
    // Track successful field access if tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackResolutionAttempt(
        `${variableName}.fields`,
        'field-access-success',
        true,
        current,
        undefined
      );
    }
    
    return current;
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
          // If this fails and strict mode is on, rethrow
          if (context.strict) {
            throw error;
          }
          // Otherwise continue with fallback approaches
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
            if (context.strict) {
              throw error;
            }
          }
          
          logger.debug('Error using resolutionClient.resolveInContext', { 
            error: error instanceof Error ? error.message : String(error),
            reference 
          });
          
          // If strict mode is on, rethrow
          if (context.strict) {
            if (error instanceof Error) {
              throw error;
            }
            throw new Error(String(error));
          }
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
      
      // Always propagate errors if strict mode is enabled
      if (context.strict) {
        throw error;
      }
      
      // In non-strict mode, return empty string for errors
      return '';
    }
  }

  /**
   * Parse content using regex-based approach as a fallback
   * This is used when AST-based parsing fails
   */
  private parseWithRegex(content: string): MeldNode[] {
    const result: MeldNode[] = [];
    
    // Simple implementation to avoid edge cases in the regex approach
    let remaining = content;
    let startIndex = remaining.indexOf('{{');
    
    while (startIndex !== -1) {
      // Add text before the variable
      if (startIndex > 0) {
        result.push({
          type: 'Text',
          content: remaining.substring(0, startIndex)
        } as TextNode);
      }
      
      const endIndex = remaining.indexOf('}}', startIndex);
      if (endIndex === -1) {
        // No closing braces - treat the rest as text
        result.push({
          type: 'Text',
          content: remaining
        } as TextNode);
        break;
      }
      
      const varContent = remaining.substring(startIndex + 2, endIndex);
      
      // Check if the variable reference contains another variable reference
      if (varContent.includes('{{')) {
        // This is a nested reference - keep it as text for later processing
        result.push({
          type: 'Text',
          content: remaining.substring(startIndex, endIndex + 2)
        } as TextNode);
      } else {
        // Parse as a regular variable reference
        const { baseName, fields } = this.parseVariableReference(varContent);
        const valueType = fields && fields.length > 0 ? 'data' : 'text';
        result.push(createVariableReferenceNode(baseName, valueType, fields));
      }
      
      // Move to the next position
      remaining = remaining.substring(endIndex + 2);
      startIndex = remaining.indexOf('{{');
    }
    
    // Add any remaining text
    if (remaining.length > 0) {
      result.push({
        type: 'Text',
        content: remaining
      } as TextNode);
    }
    
    return result;
  }
}
