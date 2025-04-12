import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IOutputService, OutputFormat, OutputOptions } from '@services/pipeline/OutputService/IOutputService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types.js'; // Try importing from @core/types directly
import { formatWithPrettier } from '@core/utils/prettierUtils.js';

/**
 * This file uses "transformation mode" terminology throughout.
 * Transformation mode means that:
 * - Directives are replaced with their transformed results
 * - Original document formatting is preserved exactly as is
 * - No additional formatting is applied unless explicitly requested with the `pretty` option
 * 
 * Note: Previously, there was also "output-normalized"/"standard" mode that applied custom 
 * markdown formatting rules. This mode has been removed, and transformation is now always enabled.
 * Optional formatting is now handled by Prettier with the `pretty` option.
 */

import type { 
  MeldNode, 
  TextNode, 
  CodeFenceNode, 
  DirectiveNode, 
  Field 
} from '@core/syntax/types/index.js';
import type { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference.js';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { MeldError } from '@core/errors/MeldError.js';
import { inject, injectable, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { IVariableReferenceResolverClient, FieldAccessOptions } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';

/**
 * Tracking context for variable formatting to preserve formatting during substitution
 */
interface FormattingContext {
  /** Current node type being processed */
  nodeType: string;
  /** 
   * Whether transformation mode is enabled (always true now)
   * @deprecated This is always true now and maintained only for backward compatibility
   */
  transformationMode: boolean;
  /** 
   * Whether exact document formatting is preserved (always true now)
   * @deprecated This is always true now and maintained only for backward compatibility
   */
  isOutputLiteral: boolean;
  /** Whether this is an inline or block context */
  contextType: 'inline' | 'block';
  /** Whether text is at the start of a line */
  atLineStart: boolean;
  /** Whether text is at the end of a line */
  atLineEnd: boolean;
  /** Indentation level for the current context */
  indentation: string;
  /** Whether the last output ended with a newline */
  lastOutputEndedWithNewline: boolean;
  /** Whether we're inside special markdown (list, table, etc.) */
  specialMarkdown?: 'list' | 'table' | 'code' | 'heading';
  /** Parent context for inheriting properties */
  parentContext?: FormattingContext;
  /** 
   * Whether to preserve exact formatting from the source (always true now)
   * @deprecated This is always true now and maintained only for backward compatibility
   */
  preserveFormatting: boolean;
}

/**
 * Helper class to handle field access consistently
 * This enhanced version can use the VariableReferenceResolverClient when available
 */
class FieldAccessHandler {
  constructor(
    private resolutionClient?: IResolutionServiceClient,
    private getVariableResolver?: () => IVariableReferenceResolverClient | undefined
  ) {}

  /**
   * Access a field in an object with proper error handling
   * Uses the VariableReferenceResolverClient when available for consistent field access
   * 
   * @param obj Object to access field from
   * @param fieldPath Path to the field (a.b.c or a.0.b)
   * @param context Optional resolution context for client-based resolution
   * @param options Options for field access
   * @returns The field value or undefined if not found
   */
  async accessField(
    obj: any, 
    fieldPath: string, 
    context?: ResolutionContext,
    options: {
      strict?: boolean;
      defaultValue?: any;
      variableName?: string;
      preserveType?: boolean;
    } = {}
  ): Promise<any> {
    // Handle null or empty cases
    if (!obj || !fieldPath) {
      return options.defaultValue;
    }

    // Try to use the VariableReferenceResolverClient if available
    if (this.getVariableResolver && context) {
      const resolver = this.getVariableResolver();
      if (resolver) {
        try {
          // Create field access options from our parameters
          const fieldOptions: FieldAccessOptions = {
            preserveType: options.preserveType ?? false,
            variableName: options.variableName
          };

          // Use the client to access fields
          const result = await resolver.accessFields(obj, fieldPath, context, fieldOptions);
          logger.debug('Field access using variable resolver client', {
            fieldPath,
            result: typeof result === 'object' ? 'Object' : result,
            preserveType: options.preserveType
          });
          return result;
        } catch (clientError) {
          logger.warn('Error using variable resolver client for field access, falling back to direct access', {
            error: clientError instanceof Error ? clientError.message : String(clientError)
          });
          // Fall through to direct access if client fails
        }
      }
    }

    // Fall back to direct field access if client is not available or fails
    try {
      const fields = fieldPath.split('.');
      let current = obj;

      for (const field of fields) {
        // Handle array indices
        if (/^\d+$/.test(field) && Array.isArray(current)) {
          const index = parseInt(field, 10);
          if (index >= 0 && index < current.length) {
            current = current[index];
          } else if (options.strict) {
            throw new Error(`Array index out of bounds: ${index}`);
          } else {
            return options.defaultValue;
          }
        } 
        // Handle object properties
        else if (typeof current === 'object' && current !== null) {
          if (field in current) {
            current = current[field];
          } else if (options.strict) {
            throw new Error(`Field not found: ${field}`);
          } else {
            return options.defaultValue;
          }
        } 
        // Handle accessing fields on non-objects
        else if (options.strict) {
          throw new Error(`Cannot access field ${field} on ${typeof current}`);
        } else {
          return options.defaultValue;
        }
      }
      return current;
    } catch (error) {
      logger.debug('Error in direct field access', { fieldPath, error, obj });
      if (options.strict) {
        throw error;
      }
      return options.defaultValue;
    }
  }

  /**
   * Synchronous version of accessField for backward compatibility
   * Does not use the VariableReferenceResolverClient
   */
  accessFieldSync(obj: any, fieldPath: string, options: {
    strict?: boolean;
    defaultValue?: any;
  } = {}): any {
    if (!obj || !fieldPath) {
      return options.defaultValue;
    }

    const fields = fieldPath.split('.');
    let current = obj;

    try {
      for (const field of fields) {
        // Handle array indices
        if (/^\d+$/.test(field) && Array.isArray(current)) {
          const index = parseInt(field, 10);
          if (index >= 0 && index < current.length) {
            current = current[index];
          } else if (options.strict) {
            throw new Error(`Array index out of bounds: ${index}`);
          } else {
            return options.defaultValue;
          }
        } 
        // Handle object properties
        else if (typeof current === 'object' && current !== null) {
          if (field in current) {
            current = current[field];
          } else if (options.strict) {
            throw new Error(`Field not found: ${field}`);
          } else {
            return options.defaultValue;
          }
        } 
        // Handle accessing fields on non-objects
        else if (options.strict) {
          throw new Error(`Cannot access field ${field} on ${typeof current}`);
        } else {
          return options.defaultValue;
        }
      }
      return current;
    } catch (error) {
      logger.debug('Error accessing field', { fieldPath, error, obj });
      if (options.strict) {
        throw error;
      }
      return options.defaultValue;
    }
  }

  /**
   * Convert a value to string with appropriate formatting
   * Uses the VariableReferenceResolverClient if available
   * Enhanced with improved context awareness for consistent formatting
   */
  convertToString(value: any, options?: {
    pretty?: boolean,
    preserveType?: boolean,
    context?: 'inline' | 'block',
    formattingContext?: FieldAccessOptions['formattingContext']
  }): string {
    // Try to use the VariableReferenceResolverClient if available
    if (this.getVariableResolver) {
      const resolver = this.getVariableResolver();
      if (resolver) {
        try {
          // Map our options to the client's expected format
          const fieldOptions: FieldAccessOptions = {
            preserveType: options?.preserveType ?? false,
            formattingContext: options?.formattingContext || {
              isBlock: options?.context === 'block',
              nodeType: 'Text',
              linePosition: 'middle',
              isTransformation: true // Always true now
            }
          };

          // Use the client for string conversion
          return resolver.convertToString(value, fieldOptions);
        } catch (clientError) {
          logger.warn('Error using variable resolver client for string conversion, falling back', {
            error: clientError instanceof Error ? clientError.message : String(clientError)
          });
          // Fall through to default handling if client fails
        }
      }
    }

    // Fall back to direct string conversion with enhanced context-awareness
    
    // Extract options with defaults
    const {
      pretty = false,
      preserveType = false,
      context = 'inline',
      formattingContext
    } = options || {};
    
    // Get context type from either source
    const isBlockContext = formattingContext?.isBlock || context === 'block';
    const isTransformation = true; // Always true now
    const specialMarkdown = (formattingContext as any)?.specialMarkdown;
    
    // Handle undefined or null values - always return empty string per spec
    if (value === undefined || value === null) {
      return '';
    }
    
    // Return strings directly, preserving their formatting
    if (typeof value === 'string') {
      return value;
    }
    
    // Convert basic primitives
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    
    // Handle arrays with consistent, context-aware formatting
    if (Array.isArray(value)) {
      // Empty array - always render as '[]' per spec
      if (value.length === 0) {
        return '[]';
      }
      
      // Convert each item with context inheritance
      const items = value.map(item => this.convertToString(item, { 
        pretty: false,  // Don't prettify nested items in arrays
        preserveType,
        context: 'inline', // Use inline context for array items
        formattingContext: {
          ...formattingContext,
          isBlock: false // Force inline for array elements
        }
      }));
      
      // Format based on context and content
      
      // Block context - render as bullet list if not in special markdown
      if (isBlockContext && !specialMarkdown) {
        return items.map(item => `- ${item}`).join('\n');
      }
      
      // Special case: arrays in table cells or list items
      if (specialMarkdown === 'table' || specialMarkdown === 'list') {
        // Compact, comma-separated rendering for arrays in special contexts
        return items.join(', ');
      }
      
      // Default array formatting (comma-separated) for inline context
      return items.join(', ');
    }
    
    // Handle objects with context-aware formatting
    if (typeof value === 'object') {
      try {
        // Empty object - return "{}" for consistency with empty arrays
        if (Object.keys(value).length === 0) {
          return '{}';
        }
        
        // Block context (not in code fence) - render as fenced code block with pretty JSON
        if (isBlockContext && specialMarkdown !== 'code') {
          // Add appropriate code fence with pretty-printed JSON
          return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
        }
        
        // Code fence context - render as pretty JSON without fences
        if (specialMarkdown === 'code') {
          return JSON.stringify(value, null, 2);
        }
        
        // Inline context - use compact JSON
        return JSON.stringify(value);
      } catch (error) {
        logger.error('Error stringifying object', { value, error });
        return '[Object]';
      }
    }
    
    // Default fallback
    return String(value);
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
   * Check if an array contains complex items (objects, arrays, long strings)
   */
  private containsComplexItems(arr: any[]): boolean {
    return arr.some(item => {
      // Objects are complex
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        return true;
      }
      
      // Nested arrays are complex
      if (Array.isArray(item)) {
        return true;
      }
      
      // Long strings are complex
      if (typeof item === 'string' && item.length > 50) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * Check if an array contains only simple values (strings, numbers, booleans)
   */
  private isArrayOfSimpleValues(arr: any[]): boolean {
    return arr.every(item => {
      return (
        typeof item === 'string' || 
        typeof item === 'number' || 
        typeof item === 'boolean' ||
        item === null ||
        item === undefined
      );
    });
  }
  
  /**
   * Check if an array contains mostly objects
   */
  private isArrayOfObjects(arr: any[]): boolean {
    if (arr.length === 0) {
      return false;
    }
    
    // Check if most items (>50%) are objects
    const objectCount = arr.filter(item => 
      typeof item === 'object' && 
      item !== null && 
      !Array.isArray(item)
    ).length;
    
    return objectCount / arr.length > 0.5;
  }
}

type FormatConverter = (
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
) => Promise<string>;

const DEFAULT_OPTIONS: Required<OutputOptions> = {
  includeState: false,
  preserveFormatting: true,
  pretty: false,
  formatOptions: {}
};

@injectable()
@Service({
  description: 'Service responsible for converting Meld nodes to different output formats',
  dependencies: [
    { token: 'IStateService', name: 'state' },
    { token: 'IResolutionService', name: 'resolutionService' },
    { token: 'ResolutionServiceClientFactory', name: 'resolutionServiceClientFactory', optional: true }
  ]
})
export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();
  private state: IStateService | undefined;
  private resolutionService: IResolutionService | undefined;
  private resolutionClient?: IResolutionServiceClient;
  private variableResolver?: IVariableReferenceResolverClient;
  private fieldAccessHandler: FieldAccessHandler;
  private contextStack: FormattingContext[] = [];

  /**
   * Gets (or creates) the variable reference resolver client using direct container resolution
   * This method uses lazy loading to avoid circular dependencies during initialization
   * @returns The variable reference resolver client or undefined if resolution fails
   */
  getVariableResolver(): IVariableReferenceResolverClient | undefined {
    if (!this.variableResolver) {
      try {
        // Resolve the factory directly from the container to avoid circular dependencies
        const factory = container.resolve(VariableReferenceResolverClientFactory);
        this.variableResolver = factory.createClient();
        logger.debug('Created variable resolver client using direct container resolution');
      } catch (error) {
        logger.warn('Failed to create variable resolver client', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return undefined;
      }
    }
    return this.variableResolver;
  }

  public canAccessTransformedNodes(): boolean {
    return true;
  }

  /**
   * Creates a new OutputService instance.
   * Uses dependency injection for service dependencies.
   * 
   * @param state State service (injected)
   * @param resolutionService Resolution service for variable resolution (injected)
   * @param resolutionServiceClientFactory Factory for resolution client (injected)
   */
  constructor(
    @inject('IStateService') state?: IStateService,
    @inject('IResolutionService') resolutionService?: IResolutionService,
    @inject('ResolutionServiceClientFactory') resolutionServiceClientFactory?: ResolutionServiceClientFactory,
    @inject(VariableNodeFactory) private readonly variableNodeFactory?: VariableNodeFactory
  ) {
    this.initializeFromParams(state, resolutionService, resolutionServiceClientFactory);
    
    // Initialize field access handler with access to the variable resolver method
    // This allows the handler to use the resolver when needed without creating circular dependencies
    this.fieldAccessHandler = new FieldAccessHandler(
      this.resolutionClient,
      this.getVariableResolver.bind(this)
    );
    
    // Initialize variable node factory with fallback to container resolution
    if (!this.variableNodeFactory) {
      try {
        this.variableNodeFactory = container.resolve(VariableNodeFactory);
      } catch (error) {
        logger.warn('Failed to resolve VariableNodeFactory from container', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Initialize this service with the given parameters.
   * Always uses DI mode initialization.
   */
  private initializeFromParams(
    state?: IStateService,
    resolutionService?: IResolutionService,
    resolutionServiceClientFactory?: ResolutionServiceClientFactory
  ): void {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('xml', this.convertToXML.bind(this));

    // Always initialize in DI mode
    this.state = state;
    this.resolutionService = resolutionService;
    
    // Initialize resolution client if factory is provided
    if (resolutionServiceClientFactory) {
      try {
        this.resolutionClient = resolutionServiceClientFactory.createClient();
        logger.debug('Created resolution client using factory');
      } catch (error) {
        logger.warn('Failed to create resolution client', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    logger.debug('OutputService initialized with state service', {
      hasResolutionService: !!resolutionService,
      hasResolutionClient: !!this.resolutionClient,
      formats: Array.from(this.formatters.keys())
    });
  }

  /**
   * @deprecated Use dependency injection instead of manual initialization.
   * This method is kept for backward compatibility but will be removed in a future version.
   */
  initialize(state: IStateService, resolutionService?: IResolutionService): void {
    this.state = state;
    this.resolutionService = resolutionService;
    
    logger.debug('OutputService manually initialized with state service', {
      hasResolutionService: !!resolutionService
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    logger.debug('Converting output', {
      format,
      nodeCount: nodes.length,
      options: opts,
      pretty: opts.pretty
    });

    // We always use transformed nodes now (transformation is always enabled)
    const nodesToProcess = state.getTransformedNodes();

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      // Get the raw output from the formatter
      let result = await formatter(nodesToProcess, state, opts);
      
      // Apply Prettier formatting if requested
      if (opts.pretty) {
        // Use the correct parser based on the format
        const parser = format === 'xml' ? 'html' : 'markdown';
        result = await formatWithPrettier(result, parser as 'markdown' | 'json' | 'html');
        
        logger.debug('Applied Prettier formatting', {
          format,
          parser,
          resultLength: result.length
        });
      }
      
      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length,
        transformedNodesCount: nodesToProcess.length,
        pretty: opts.pretty
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error,
        pretty: opts.pretty
      });

      if (error instanceof MeldOutputError) {
        throw error;
      }

      throw new MeldOutputError(
        'Failed to convert output',
        format,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  registerFormat(
    format: string,
    converter: FormatConverter
  ): void {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }
    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.formatters.set(format, converter);
    logger.debug('Registered format converter', { format });
  }

  supportsFormat(format: string): boolean {
    return this.formatters.has(format);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Create a new formatting context for the current node
   * @param nodeType The type of node being processed
   * @param transformationMode Deprecated: Always true now as we only use output-literal mode
   * @returns A new formatting context object
   */
  private createFormattingContext(nodeType: string, transformationMode: boolean): FormattingContext {
    return {
      nodeType,
      transformationMode: true, // Always true now
      isOutputLiteral: true, // Always true now
      contextType: 'block', // Default to block context
      atLineStart: true,
      atLineEnd: false,
      indentation: '',
      lastOutputEndedWithNewline: false,
      preserveFormatting: true // Always preserve formatting
    };
  }

  /**
   * Create a child formatting context that inherits properties from the parent
   * @param parentContext The parent context to inherit from
   * @param childNodeType The type of the child node
   * @returns A new formatting context with inherited properties
   */
  private createChildContext(parentContext: FormattingContext, childNodeType: string): FormattingContext {
    return {
      nodeType: childNodeType,
      transformationMode: true, // Always true now
      isOutputLiteral: true, // Always true now
      contextType: parentContext.contextType,
      atLineStart: parentContext.atLineStart,
      atLineEnd: parentContext.atLineEnd,
      indentation: parentContext.indentation,
      lastOutputEndedWithNewline: parentContext.lastOutputEndedWithNewline,
      specialMarkdown: parentContext.specialMarkdown,
      parentContext: parentContext,
      preserveFormatting: true // Always preserve formatting
    };
  }

  /**
   * Push a new formatting context onto the stack
   * @param context The context to push
   */
  private pushFormattingContext(context: FormattingContext): void {
    this.contextStack.push(context);
  }

  /**
   * Get the current formatting context
   * @returns The current formatting context or a default context
   */
  private getCurrentFormattingContext(): FormattingContext {
    if (this.contextStack.length === 0) {
      // Default context if none exists
      const defaultContext = this.createFormattingContext('Text', true);
      this.contextStack.push(defaultContext);
    }
    return this.contextStack[this.contextStack.length - 1];
  }

  /**
   * Pop the current formatting context from the stack
   * @returns The popped context or undefined if stack is empty
   */
  private popFormattingContext(): FormattingContext | undefined {
    return this.contextStack.pop();
  }

  /**
   * Handle newlines according to the formatting standards
   * @param content The content to process
   * @param context The formatting context
   * @returns The content with standardized newlines
   */
  private handleNewlines(content: string, context: FormattingContext): string {
    if (!content) return content;
    
    const inputLength = content.length;
    const hasInputNewlines = content.includes('\n');
    const endsWithNewline = content.endsWith('\n');
    
    // Log input state
    logger.debug('Processing newlines in content', {
      nodeType: context.nodeType,
      contextType: context.contextType,
      isOutputLiteral: true, // Always true now
      inputLength,
      hasInputNewlines,
      endsWithNewline,
      atLineStart: context.atLineStart,
      atLineEnd: context.atLineEnd,
      lastOutputEndedWithNewline: context.lastOutputEndedWithNewline
    });
    
    // Always preserve content EXACTLY as is with NO modifications
    // This is now the only mode - always output-literal
    logger.debug('Output-literal mode: preserving content exactly as is', {
      contentLength: content.length
    });
    return content;
  }

  /**
   * Convert a value to string representation with context-aware formatting
   * Uses the VariableReferenceResolverClient when available for enhanced formatting
   * 
   * @param value The value to convert
   * @param formatOptions Formatting options
   * @returns The string representation of the value
   */
  private convertToString(value: any, formatOptions?: { 
    pretty?: boolean, 
    preserveType?: boolean,
    context?: 'inline' | 'block',
    specialMarkdown?: string
  }): string {
    // Handle null or undefined values
    if (value === null || value === undefined) {
      return '';
    }
    
    // Enhanced formatting with special markdown context awareness
    // This ensures consistent formatting in different markdown contexts
    
    // Get current formatting context
    const currentContext = this.getCurrentFormattingContext();
    
    // Create field access options with proper formatting context
    const fieldOptions: FieldAccessOptions = {
      preserveType: formatOptions?.preserveType ?? false,
      formattingContext: {
        isBlock: formatOptions?.context === 'block',
        nodeType: 'Text', // Default to Text node
        linePosition: 'middle', // Default to middle of line
        // Use transformation mode for formatting
        isTransformation: currentContext.transformationMode
      }
    };
    
    // Log the formatting context being used
    logger.debug('Converting value to string with formatting context', {
      valueType: typeof value,
      isArray: Array.isArray(value),
      isObject: typeof value === 'object' && value !== null && !Array.isArray(value),
      context: formatOptions?.context,
      isOutputLiteral: currentContext.isOutputLiteral ?? currentContext.transformationMode,
      specialMarkdown: formatOptions?.specialMarkdown
    });
    
    // Add special markdown context if applicable
    if (formatOptions?.specialMarkdown) {
      (fieldOptions.formattingContext as any).specialMarkdown = formatOptions.specialMarkdown;
    }
    
    // Check if we have a resolver client that can handle the conversion
    if (this.variableResolver) {
      try {
        const resolvedValue = this.variableResolver.convertToString(value, fieldOptions);
        logger.debug('Resolved value using resolver client', { resolvedValue });
        return resolvedValue;
      } catch (error) {
        logger.warn('Failed to convert using resolver client, falling back to direct conversion', { error });
        // Fall through to direct conversion if resolver fails
      }
    }
    
    // Create a formatting context for value formatting
    const formattingContext: FormattingContext = {
      nodeType: 'Text', // Default to Text node
      transformationMode: currentContext.transformationMode,
      isOutputLiteral: currentContext.isOutputLiteral,
      contextType: formatOptions?.context || 'block',
      atLineStart: currentContext.atLineStart,
      atLineEnd: currentContext.atLineEnd,
      indentation: currentContext.indentation,
      lastOutputEndedWithNewline: currentContext.lastOutputEndedWithNewline,
      specialMarkdown: formatOptions?.specialMarkdown as any,
      preserveFormatting: currentContext.preserveFormatting ?? (currentContext.isOutputLiteral ?? currentContext.transformationMode)
    };
    
    // Use our specialized formatters based on value type
    if (Array.isArray(value)) {
      return this.formatArray(value, formattingContext);
    } else if (typeof value === 'object' && value !== null) {
      return this.formatObject(value, formattingContext);
    } else if (typeof value === 'string') {
      return this.formatString(value, formattingContext);
    } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      // Simple conversion for primitives
      return String(value);
    }
    
    // Fallback for any other type
    return String(value);
  }

  /**
   * Helper method to safely extract string content from various node types
   * ensuring proper type safety
   */
  private getTextContentFromNode(node: any): string {
    // Handle undefined or null
    if (node === undefined || node === null) {
      return '';
    }
    
    // Handle id or identifier properties
    if ('id' in node && typeof node.id === 'string') {
      return node.id;
    }
    
    if ('identifier' in node && typeof node.identifier === 'string') {
      return node.identifier;
    }
    
    // Handle direct text content
    if ('text' in node && node.text !== undefined && node.text !== null) {
      return String(node.text);
    }
    
    // Handle value property which could be various types
    if ('value' in node) {
      const value = node.value;
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '';
        }
      }
      return String(value);
    }
    
    // Handle content property as a fallback
    if ('content' in node) {
      const content = node.content;
      if (content === null || content === undefined) {
        return '';
      }
      if (typeof content === 'string' || typeof content === 'number' || typeof content === 'boolean') {
        return String(content);
      }
      if (typeof content === 'object') {
        try {
          return JSON.stringify(content);
        } catch {
          return '';
        }
      }
      return String(content);
    }
    
    // Final fallback
    return '';
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      let output = '';

      // Debug: Log node types
      logger.debug('Converting nodes to markdown', {
        nodeCount: nodes.length,
        nodeTypes: nodes.map(n => n.type),
        isOutputLiteral: true // Always true now
      });

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Process nodes with exact preservation of all formatting
      for (const node of nodes) {
        try {
          // Get the node output
          const nodeOutput = await this.nodeToMarkdown(node, state);
          
          // Skip empty outputs
          if (!nodeOutput) continue;
          
          // Add to output buffer with NO modifications
          output += nodeOutput;
        } catch (nodeError) {
          // Log detailed error for the specific node
          logger.error('Error converting node to markdown', {
            nodeType: node.type,
            location: node.location,
            error: nodeError
          });
          throw nodeError;
        }
      }
      
      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to markdown',
        'markdown',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async convertToXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    try {
      // First convert to markdown since XML is based on markdown
      let markdown;
      
      // If formatOptions.markdown is provided, use it directly
      if (options?.formatOptions?.markdown) {
        markdown = options.formatOptions.markdown as string;
      } else {
        // Otherwise, convert nodes to markdown
        markdown = await this.convertToMarkdown(nodes, state, options);
      }
      
      // Log the markdown for debugging
      logger.debug('Converting markdown to XML', { markdown });

      // Use enhanced llmxml 1.5.0 features
      const { createLLMXML } = await import('llmxml');
      
      // Extract XML format options from the options parameter
      const xmlOptions = options?.formatOptions?.xml || {};
      
      // Create LLMXML instance with more granular configuration
      const llmxml = createLLMXML({
        warningLevel: 'none'
      });
      
      // Convert markdown to XML using llmxml with per-call configuration
      const xmlResult = await llmxml.toXML(markdown);
      
      logger.debug('Successfully converted to XML', { xmlLength: xmlResult.length });
      return xmlResult;
    } catch (error) {
      // Handle error
      logger.error('LLMXML conversion error', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw new MeldOutputError(
          `XML conversion error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'xml',
          { 
            cause: error instanceof Error ? error : new Error(String(error))
          }
        );
    }
  }

  private formatStateVariables(state: IStateService): string {
    let output = '';

    // Format text variables
    const textVars = state.getAllTextVars();
    if (textVars.size > 0) {
      output += '# Text Variables\n\n';
      for (const [name, value] of textVars) {
        output += `@text ${name} = "${value}"\n`;
      }
    }

    // Format data variables
    const dataVars = state.getAllDataVars();
    if (dataVars.size > 0) {
      if (output) output += '\n';
      output += '# Data Variables\n\n';
      for (const [name, value] of dataVars) {
        output += `@data ${name} = ${JSON.stringify(value, null, 2)}\n`;
      }
    }

    return output;
  }

  private async nodeToMarkdown(node: MeldNode, state: IStateService): Promise<string> {
    // Debug: Log node structure
    logger.debug('Processing node in nodeToMarkdown', {
      nodeType: node.type,
      nodeStructure: Object.keys(node),
      location: node.location,
      // Add transformation info
      isTransformationEnabled: state.isTransformationEnabled(),
      // Add boundary info from context stack
      contextStackDepth: this.contextStack.length,
      hasPreviousContext: this.contextStack.length > 0
    });

    // Track the previous node type for boundary detection
    const previousContext = this.contextStack.length > 0 
      ? this.contextStack[this.contextStack.length - 1] 
      : null;
    
    // Track if this is a boundary between different node types
    const isNodeBoundary = previousContext && previousContext.nodeType !== node.type;
    
    if (isNodeBoundary) {
      logger.debug('Node boundary detected', {
        previousNodeType: previousContext.nodeType,
        currentNodeType: node.type,
        previousContextType: previousContext.contextType,
        isDirectiveToBoundary: 
          (previousContext.nodeType !== 'Text' && previousContext.nodeType !== 'CodeFence') && 
          (node.type === 'Text' || node.type === 'CodeFence'),
        isTextToDirectiveBoundary: 
          (previousContext.nodeType === 'Text' || previousContext.nodeType === 'CodeFence') && 
          (node.type !== 'Text' && node.type !== 'CodeFence')
      });
    }

    switch (node.type) {
      case 'Text':
        const textNode = node as TextNode;
        const content = textNode.content;
        
        // Create a formatting context for this node
        const formattingContext = this.createFormattingContext(
          'Text', 
          state.isTransformationEnabled()
        );
        
        // Check for formatting metadata to preserve context from directive transformations
        if (textNode.formattingMetadata) {
          logger.debug('Found formatting metadata in Text node', {
            isFromDirective: textNode.formattingMetadata.isFromDirective,
            originalNodeType: textNode.formattingMetadata.originalNodeType,
            preserveFormatting: textNode.formattingMetadata.preserveFormatting,
            contentLength: content.length
          });
          
          // If this node was created from a directive, use that information for context
          if (textNode.formattingMetadata.isFromDirective && textNode.formattingMetadata.originalNodeType) {
            // Override the node type to match the original directive
            formattingContext.nodeType = textNode.formattingMetadata.originalNodeType;
            
            // Explicitly preserve formatting if requested
            if (textNode.formattingMetadata.preserveFormatting) {
              // Force output-literal mode for this node to preserve exact formatting
              formattingContext.transformationMode = true;
              formattingContext.isOutputLiteral = true;
              formattingContext.preserveFormatting = true;
            }
          }
        }
        
        // Inherit properties from previous context if it exists
        if (previousContext) {
          formattingContext.lastOutputEndedWithNewline = previousContext.lastOutputEndedWithNewline;
          formattingContext.atLineStart = previousContext.lastOutputEndedWithNewline;
          formattingContext.parentContext = previousContext;
        }
        
        // Log the context we're using
        logger.debug('Text node formatting context', {
          contextType: formattingContext.contextType,
          isOutputLiteral: formattingContext.isOutputLiteral ?? formattingContext.transformationMode,
          atLineStart: formattingContext.atLineStart,
          atLineEnd: formattingContext.atLineEnd,
          lastOutputEndedWithNewline: formattingContext.lastOutputEndedWithNewline,
          isNodeBoundary,
          contentLength: content.length,
          hasNewlines: content.includes('\n')
        });
        
        // Check if text starts at beginning of line
        formattingContext.atLineStart = content.startsWith('\n') || 
                                        !content.trim() || 
                                        content.trim().startsWith('\n');
        
        // Check if text ends at end of line
        formattingContext.atLineEnd = content.endsWith('\n');
        
        // Determine if this is block or inline context
        // Improved detection for block vs. inline context:
        // - Text with multiple lines is block context
        // - Text with markdown headings is block context
        // - Text with list markers is block context
        // - Text inside tables is handled specially
        if (content.includes('\n')) {
          formattingContext.contextType = 'block';
        } else if (/^#{1,6}\s/.test(content.trim())) {
          // Markdown heading - block context
          formattingContext.contextType = 'block';
          formattingContext.specialMarkdown = 'heading';
        } else if (/^[-*+]\s/.test(content.trim()) || /^\d+\.\s/.test(content.trim())) {
          // List item - block context with special handling
          formattingContext.contextType = 'block';
          formattingContext.specialMarkdown = 'list';
        } else if (/^\|.*\|/.test(content.trim()) || content.includes('|')) {
          // Table cell - inline context with special handling
          formattingContext.contextType = 'inline';
          formattingContext.specialMarkdown = 'table';
        } else {
          // Default to inline context for single-line text
          formattingContext.contextType = 'inline';
        }
        
        // In transformation mode, directly replace variable references with their values
        if (state.isTransformationEnabled() && content.includes('{{')) {
          // <<< DEBUG LOGGING START >>>
          console.log(`[DEBUG OutputService] nodeToMarkdown: Found '{{' in content: "${content.substring(0, 50)}..."`);
          console.log(`[DEBUG OutputService] nodeToMarkdown: this.resolutionService defined? ${!!this.resolutionService}`);
          // <<< DEBUG LOGGING END >>>
          
          const variableRegex = /\{\{([^{}]+)\}\}/g;
          let transformedContent = content;
          const matches = Array.from(content.matchAll(variableRegex));
          
          logger.debug('Found variable references in Text node', {
            content,
            matches: (matches as RegExpMatchArray[]).map(m => m[0]),
            transformationEnabled: state.isTransformationEnabled(),
            transformationOptions: state.getTransformationOptions ? state.getTransformationOptions() : 'N/A',
          });
          
          // If no matches, return original content with proper newline handling
          if (matches.length === 0) {
            // In transformation mode, preserve original newline handling
            return this.handleNewlines(content, formattingContext);
          }
          
          // Only proceed with transformation if we're supposed to transform variables

          // Process each variable reference
          let finalTransformedContent = content;
          for (const match of matches as RegExpMatchArray[]) {
            const fullMatch = match[0]; // The entire match, e.g., {{variable}}
            const reference = match[1].trim(); // The variable reference, e.g., variable
            
            try {
              let resolvedValue = fullMatch; // Default to original match if resolution fails

              // Resolve the variable using resolutionService
              if (this.resolutionService && state) {
                  // Create context for resolution
                  const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
                    state,
                    state.getCurrentFilePath() ?? undefined
                  );
                  // Use resolveVariable for potentially complex paths
                  // TODO: Review if resolveInContext or resolveVariable is more appropriate here.
                  //       resolveVariable might be better if `reference` includes field access.
                  resolvedValue = await this.resolutionService.resolveVariable(reference, context);
              } else {
                  logger.warn('ResolutionService or State not available for variable resolution in nodeToMarkdown');
              }
              
              // Replace the variable reference 
              // Use a temporary variable to avoid issues with replacing multiple identical placeholders
              finalTransformedContent = finalTransformedContent.replace(fullMatch, resolvedValue);
              
              logger.debug('Replaced variable reference in Text node', {
                reference,
                resolvedValue,
                fullMatch,
                // before: content, // Logging original content might be too verbose
                after: finalTransformedContent
              });
            } catch (error) {
              // Handle errors during variable resolution
              logger.error('Error resolving variable reference:', {
                fullMatch,
                reference,
                error: error instanceof Error ? error.message : String(error)
              });
              // Leave the variable reference unchanged on error (already handled by default value)
            }
          } // End of for loop
            
          // Apply proper newline handling AFTER the loop
          return this.handleNewlines(finalTransformedContent, formattingContext);
        }
        
        // Check if the content contains variable references and ResolutionService is available
        if (content.includes('{{')) {
          try {
            // Create appropriate resolution context for text variables
            const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
              state, // Correct arg order
              state.getCurrentFilePath() ?? undefined// Provide file path
            );
            
            // First try the resolution client if available
            if (this.resolutionClient) {
              try {
                const resolvedContent = await this.resolutionClient.resolveInContext(content, context);
                // Apply proper newline handling 
                return this.handleNewlines(resolvedContent, formattingContext);
              } catch (clientError) {
                logger.warn('Error using resolution client, falling back to resolution service', {
                  error: clientError instanceof Error ? clientError.message : String(clientError)
                });
              }
            }
            
            // Fall back to resolution service if client fails or is not available
            if (this.resolutionService) {
              try {
                const resolvedContent = await this.resolutionService.resolveInContext(content, context);
                logger.debug('Resolved variable references using ResolutionService', {
                  original: content,
                  resolved: resolvedContent
                });
                
                // Apply proper newline handling
                return this.handleNewlines(resolvedContent, formattingContext);
              } catch (serviceError) {
                logger.warn('Error using resolution service, falling back to our own resolver', {
                  error: serviceError instanceof Error ? serviceError.message : String(serviceError)
                });
              }
            }
            
            // If both resolution options failed, process variable references manually
            const variableRegex = /\{\{([^{}]+)\}\}/g;
            let processedContent = content;
            const matches = Array.from(content.matchAll(variableRegex));
            
            for (const match of matches as RegExpMatchArray[]) {
              const fullMatch = match[0]; // The entire match, e.g., {{variable}}
              const reference = match[1].trim(); // The variable reference, e.g., variable
              
              // Placeholder: Default to original match if resolution fails later
              const resolvedValue = fullMatch; 

              // TODO: Add calls to resolutionClient/resolutionService here later
              
              // Replace the variable reference while preserving formatting
              processedContent = processedContent.replace(fullMatch, resolvedValue);
            }
            
            // Apply proper newline handling
            return this.handleNewlines(processedContent, formattingContext);
          } catch (resolutionError) {
            logger.error('All variable resolution methods failed', {
              content,
              error: resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
            });
            // Fall back to original content if all resolution attempts fail
          }
        }
        
        // Apply proper newline handling for the original content
        return this.handleNewlines(content, formattingContext);
      case 'VariableReference':
        // Handle VariableReference nodes using the new approach
        try {
          const varNode = node as IVariableReference;
          
          // 1. Serialize the node back to its string representation
          let serializedString = `{{${varNode.identifier}`;
          if (varNode.fields && varNode.fields.length > 0) {
            const fieldString = varNode.fields.map(field => {
              if (field.type === 'field') {
                // Check if field value needs quotes (e.g., contains spaces or special chars)
                const needsQuotes = !/^[a-zA-Z0-9_]+$/.test(String(field.value));
                return needsQuotes ? `['${String(field.value).replace(/'/g, '\\\'')}']` : `.${field.value}`;
              } else if (field.type === 'index') {
                return `[${field.value}]`;
              }
              return '';
            }).join('');
            serializedString += fieldString; 
          }
          serializedString += '}}';

          logger.debug(`Serializing VariableReferenceNode: ${varNode.identifier} -> ${serializedString}`);

          // 2. Resolve using resolutionService.resolveText
          let resolvedValue = serializedString; // Default to serialized string if resolution fails
          if (this.resolutionService && state) { // Ensure both service and state are available
            try {
              // Create appropriate resolution context
              const resolveContext: ResolutionContext = ResolutionContextFactory.forTextDirective(
                state, // Correct argument order
                state.getCurrentFilePath() ?? undefined // Provide file path
              );

              resolvedValue = await this.resolutionService.resolveInContext(serializedString, resolveContext);
              logger.debug(`Resolved VariableReferenceNode ${varNode.identifier} via resolveInContext to: ${resolvedValue}`);

            } catch (error) {
              logger.error('Error resolving VariableReference node via resolveInContext', { 
                serializedString,
                error: error instanceof Error ? error.message : String(error) 
              });
              // Fallback to serializedString is handled by default value
            }
          } else {
             logger.warn('ResolutionService or StateService not available for VariableReference node processing');
          }
          
          // TODO: Apply formatting based on contextStack if needed.
          // For now, directly return the resolved value.
          return resolvedValue;
        } catch (error) {
          logger.error('Error processing VariableReference node', { 
            node: JSON.stringify(node), 
            error: error instanceof Error ? error.message : String(error) 
          });
          // In case of error, output the original reference or empty string
          const identifier = (node as IVariableReference).identifier || 'error';
          const fields = (node as IVariableReference).fields?.map(f => f.value).join('.') || '';
          return `{{${identifier}${fields ? '.' + fields : ''}}}`; // Or return '' depending on desired error handling
        }
      /* case 'DataVar':
        // Handle DataVar nodes
        try {
          // Create a formatting context for this node
          const formattingContext = this.createFormattingContext(
            'DataVar', 
            state.isTransformationEnabled()
          );
          
          logger.debug('DataVar node detailed view', {
            hasId: 'id' in node,
            idValue: 'id' in node ? node.id : 'undefined',
            hasIdentifier: 'identifier' in node,
            identifierValue: 'identifier' in node ? node.identifier : 'undefined',
            hasFields: 'fields' in node,
            fieldsValue: 'fields' in node ? JSON.stringify(node.fields) : 'undefined',
            hasData: 'data' in node,
            dataValue: 'data' in node ? JSON.stringify(node.data) : 'undefined',
            hasValue: 'value' in node,
            valueValue: 'value' in node ? JSON.stringify(node.value) : 'undefined',
            hasContent: 'content' in node,
            contentValue: 'content' in node ? JSON.stringify((node as any).content) : 'undefined',
            nodeStr: JSON.stringify(node, null, 2)
          });
          
          // Identify the variable and check for field access
          let variableIdentifier = '';
          if ('id' in node) {
            variableIdentifier = node.id as string;
          } else if ('identifier' in node) {
            variableIdentifier = node.identifier as string;
          }
          
          const hasFields = 'fields' in node && Array.isArray(node.fields) && node.fields.length > 0;
          
          // First try our field access handler if fields are present
          if (variableIdentifier && hasFields && isDataVarNode(node) && node.fields) {
            // Get the base variable value
            const dataValue = state.getDataVar(variableIdentifier);
            
            if (dataValue !== undefined) {
              // Build the field path
              const fieldPath = node.fields
                .map((field: Field) => {
                  if (field.type === 'index') {
                    return String(field.value);
                  } else if (field.type === 'field') {
                    return String(field.value);
                  }
                  return '';
                })
                .filter(Boolean)
                .join('.');
              
              logger.debug('Processing field access in DataVar', {
                variableIdentifier,
                fieldPath,
                dataValueType: typeof dataValue
              });
              
              try {
                // Create resolution context for field access
                const resolutionContext = ResolutionContextFactory.create(undefined, state);
                
                // Use field access handler to resolve fields
                const result = await this.fieldAccessHandler.accessField(
                  dataValue,
                  fieldPath,
                  resolutionContext,
                  { strict: true }
                );
                
                return this.convertToString(result, {
                  pretty: true,
                  context: this.getCurrentFormattingContext().contextType
                });
              } catch (err) {
                logger.error('Error accessing fields in DataVar', {
                  error: err,
                  variableIdentifier,
                  fieldPath
                });
                return '';
              }
            }
          }
          
          // Try resolution service as a fallback for field access
          if (variableIdentifier && hasFields && isDataVarNode(node) && node.fields) {
            try {
              // Create a resolution context
              const context: ResolutionContext = ResolutionContextFactory.forDataDirective(
                state, // Correct arg order
                state.getCurrentFilePath() ?? undefined// Provide file path
              );
              
              // Build the complete reference with all fields using dot notation
              const fieldArray = Array.isArray(node.fields) ? node.fields : [];
              const fields = fieldArray
                .map((field: Field) => {
                  if (field.type === 'index') {
                    return String(field.value);
                  } else if (field.type === 'field') {
                    return field.value;
                  }
                  return '';
                })
                .filter(Boolean);
              
              // Create a variable reference with all fields using dot notation
              const serializedNode = `{{${variableIdentifier}${fields.length > 0 ? '.' + fields.join('.') : ''}}}`;
              
              logger.debug('Resolving DataVar with serialized reference', {
                serializedNode,
                variableIdentifier,
                fields
              });
              
              // Try to resolve with client first
              if (this.resolutionClient?.resolveInContext) {
                try {
                  const resolved = await this.resolutionClient.resolveInContext(serializedNode, context);
                  logger.debug('DataVar resolved with client', {
                    serializedNode,
                    resolved
                  });
                  
                  // Apply proper newline handling
                  return this.handleNewlines(String(resolved), formattingContext);
                } catch (clientError) {
                  logger.warn('Error resolving DataVar with client, falling back to service', {
                    error: clientError instanceof Error ? clientError.message : String(clientError)
                  });
                }
              }
              
              // Try to resolve with service if client failed or not available
              if (this.resolutionService) {
                try {
                  const resolved = await this.resolutionService.resolveInContext(serializedNode, context);
                  logger.debug('DataVar resolved with service', {
                    serializedNode,
                    resolved
                  });
                  
                  // Apply proper newline handling
                  return this.handleNewlines(String(resolved), formattingContext);
                } catch (serviceError) {
                  logger.warn('Error resolving DataVar with service, falling back to standard resolution', {
                    error: serviceError instanceof Error ? serviceError.message : String(serviceError)
                  });
                }
              }
            } catch (resolutionError) {
              logger.error('All field access resolution methods failed', {
                variableIdentifier,
                error: resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
              });
              // Continue to standard variable resolution
            }
          }
          
          // Standard variable resolution without field access
          // Try to resolve the variable value
          let dataVarContent: any = '';
          
          if (variableIdentifier) {
            // Try to get the data variable
            dataVarContent = state.getDataVar(variableIdentifier);
            logger.debug(`Trying to resolve DataVar with identifier ${variableIdentifier}`, {
              resolved: dataVarContent ? JSON.stringify(dataVarContent) : 'NOT RESOLVED'
            });
          } 
          
          // Fall back to other properties if not found by identifier
          if (dataVarContent === undefined) {
            if ('data' in node && node.data) {
              dataVarContent = node.data;
            } else if ('value' in node && node.value) {
              dataVarContent = node.value;
            } else if ('content' in node && (node as any).content) {
              dataVarContent = (node as any).content;
            }
          }
          
          // Process nested variable references if it's a string value
          if (typeof dataVarContent === 'string' && dataVarContent.includes('{{')) {
            try {
              // Create appropriate resolution context
              const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
                state, // Correct arg order
                state.getCurrentFilePath() ?? undefined // Provide file path
              );
              
              // Try client first if available
              if (this.resolutionClient) {
                try {
                  dataVarContent = await this.resolutionClient.resolveInContext(dataVarContent, context);
                  logger.debug('Processed nested variables in DataVar using client', {
                    finalContent: dataVarContent
                  });
                } catch (clientError) {
                  logger.warn('Error using resolution client for nested variables, falling back', {
                    error: clientError instanceof Error ? clientError.message : String(clientError)
                  });
                }
              }
              
              // Try service if client failed or not available
              if (typeof dataVarContent === 'string' && dataVarContent.includes('{{') && this.resolutionService) {
                try {
                  dataVarContent = await this.resolutionService.resolveInContext(dataVarContent, context);
                  logger.debug('Processed nested variables in DataVar using service', {
                    finalContent: dataVarContent
                  });
                } catch (serviceError) {
                  logger.warn('Error using resolution service for nested variables, will ignore them', {
                    error: serviceError instanceof Error ? serviceError.message : String(serviceError)
                  });
                }
              }
            } catch (resolutionError) {
              logger.error('All nested variable resolution methods failed', {
                content: dataVarContent,
                error: resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
              });
            }
          }
          
          logger.debug('DataVar resolved content', {
            content: dataVarContent !== undefined ? 
              (typeof dataVarContent === 'string' ? dataVarContent : JSON.stringify(dataVarContent)) : 
              'undefined',
            type: typeof dataVarContent
          });
          
          // Determine the appropriate context
          if (typeof dataVarContent === 'string') {
            formattingContext.contextType = dataVarContent.includes('\n') ? 'block' : 'inline';
          } else if (Array.isArray(dataVarContent) && dataVarContent.length > 3) {
            formattingContext.contextType = 'block';
          } else if (typeof dataVarContent === 'object' && dataVarContent !== null && Object.keys(dataVarContent).length > 3) {
            formattingContext.contextType = 'block';
          } else {
            formattingContext.contextType = 'inline';
          }
          
          // Convert to string with proper formatting
          const result = this.convertToString(dataVarContent, {
            pretty: formattingContext.contextType === 'block',
            preserveType: false,
            context: formattingContext.contextType
          });
          
          // Apply proper newline handling
          return this.handleNewlines(result, formattingContext);
        } catch (e) {
          logger.error('Error processing DataVar node', {
            node: JSON.stringify(node),
            error: e
          });
          throw e;
        }
      */
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        // The content already includes the codefence markers, so we use it as-is
        return fence.content;
      case 'Directive':
        const directive = node as DirectiveNode;
        const kind = directive.directive.kind;

        logger.debug('OutputService processing directive:', {
          kind,
          transform: state.isTransformationEnabled(),
          hasTransformedNodes: !!state.getTransformedNodes(),
          nodeLocation: node.location,
          directiveOptions: directive.directive
        });

        // Definition directives always return empty string
        if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
          return '';
        }

        // Handle run directives
        if (kind === 'run') {
          // In non-transformation mode, return placeholder
          if (!state.isTransformationEnabled()) {
            // Create a formatting context for this node
            const formattingContext = this.createFormattingContext(
              'Directive', 
              false // not in transformation mode
            );
            
            // Apply proper newline handling
            const placeholder = '[run directive output placeholder]';
            
            // We need to ensure the placeholder has trailing newlines
            // This is a special case for run directives to match test expectations
            return placeholder + '\n\n';
          }
          
          // In transformation mode, return the command output
          const transformedNodes = state.getTransformedNodes();
          if (transformedNodes && transformedNodes.length > 0) {
            // First try exact line match (original behavior)
            const exactMatch = transformedNodes.find(n => 
              n.location?.start.line === node.location?.start.line
            );
            
            logger.debug('Looking for transformed run directive node', {
              directiveLine: node.location?.start.line,
              transformedNodeCount: transformedNodes.length,
              foundExactMatch: !!exactMatch,
              command: directive.directive.command
            });
            
            if (exactMatch && exactMatch.type === 'Text') {
              const content = (exactMatch as TextNode).content;
              return content.endsWith('\n') ? content : content + '\n';
            }
            
            // If exact match not found, try to find the closest matching node
            // This handles cases where line numbers have shifted during transformation
            let closestNode: MeldNode | null = null;
            let smallestLineDiff = Number.MAX_SAFE_INTEGER;
            
            for (const transformedNode of transformedNodes) {
              if (transformedNode.type === 'Text' && 
                  node.location?.start.line && 
                  transformedNode.location?.start.line) {
                
                const lineDiff = Math.abs(
                  transformedNode.location.start.line - node.location.start.line
                );
                
                // Update closest node if this one is closer
                if (lineDiff < smallestLineDiff) {
                  smallestLineDiff = lineDiff;
                  closestNode = transformedNode;
                }
              }
            }
            
            // Use the closest node if it's within a reasonable range (5 lines)
            if (closestNode && smallestLineDiff <= 5) {
              logger.debug('Found closest transformed node for run directive', {
                originalLine: node.location?.start.line,
                closestNodeLine: closestNode.location?.start.line,
                lineDifference: smallestLineDiff,
                nodeType: closestNode.type
              });
              
              const content = (closestNode as TextNode).content;
              return content.endsWith('\n') ? content : content + '\n';
            }
          }
          
          // If no transformed node found, return placeholder
          logger.warn('No transformed node found for run directive', {
            directiveLine: node.location?.start.line,
            command: directive.directive.command
          });
          return '[run directive output placeholder]\n';
        }

        // Handle other execution directives
        if (['embed'].includes(kind)) {
          // Debug logging for embed directive - write to debug file
          const fs = require('fs');
          const debugContent = `
EMBED DIRECTIVE DEBUG:
Node: ${JSON.stringify(node, null, 2)}
Path type: ${typeof directive.directive.path}
Path value: ${JSON.stringify(directive.directive.path, null, 2)}
Is variable reference?: ${typeof directive.directive.path === 'object' && 
             directive.directive.path !== null && 
             directive.directive.path.isVariableReference === true}
Transformation enabled?: ${state.isTransformationEnabled()}
`;
          try {
            fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', debugContent);
          } catch (err) {
            logger.error('Failed to write debug info:', err);
          }
          
          // In non-transformation mode, return placeholder
          if (!state.isTransformationEnabled()) {
            return '[directive output placeholder]\n\n';
          }
          
          // PHASE 4B FIX: Special handling for variable-based embed directives in transformation mode
          // This special case handles embed directives with variable references like @embed {{role.architect}}
          if (directive.directive.path && 
              typeof directive.directive.path === 'object' && 
              directive.directive.path.isVariableReference === true &&
              state.isTransformationEnabled()) {
          
            // Debug logging
            console.log('PHASE 4B SPECIAL HANDLING TRIGGERED for variable-based embed');
            console.log('Directive path:', JSON.stringify(directive.directive.path));
            
            // Log detailed information about the variable-based embed directive to file
            const fs = require('fs');
            fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
              'PHASE 4B: Handling variable-based embed directive in transformation mode\n' +
              'Path: ' + JSON.stringify(directive.directive.path, null, 2) + '\n'
            );
            
            // Extract variable name based on AST structure
            let varName;
            if (directive.directive.path.identifier) {
                // Direct identifier
                varName = directive.directive.path.identifier;
            } else if (directive.directive.path.variable && directive.directive.path.variable.identifier) {
                // Variable in nested structure
                varName = directive.directive.path.variable.identifier;
            } else {
                // Fallback: Try to extract from raw text
                const raw = directive.directive.path.raw;
                if (raw && typeof raw === 'string' && raw.startsWith('{{') && raw.endsWith('}}')) {
                    const inner = raw.substring(2, raw.length - 2);
                    varName = inner.split('.')[0];
                }
            }
            
            // Extract field path if present - handle different AST structures
            let fieldPath = '';
            
            // Direct fields array
            if (directive.directive.path.fields && Array.isArray(directive.directive.path.fields)) {
              fieldPath = directive.directive.path.fields
                .map((field: { type: 'field' | 'index'; value: string | number }) => {
                  if (field.type === 'field') {
                    return field.value;
                  } else if (field.type === 'index') {
                    return field.value;
                  }
                  return '';
                })
                .filter(Boolean)
                .join('.');
            } 
            // Nested variable with fields
            else if (directive.directive.path.variable && 
                     directive.directive.path.variable.fields && 
                     Array.isArray(directive.directive.path.variable.fields)) {
              
              fieldPath = directive.directive.path.variable.fields
                .map((field: { type: 'field' | 'index'; value: string | number }) => {
                  if (field.type === 'field') {
                    return field.value;
                  } else if (field.type === 'index') {
                    return field.value;
                  }
                  return '';
                })
                .filter(Boolean)
                .join('.');
            }
            // Fallback: Parse from raw text if available
            else if (directive.directive.path.raw) {
              const raw = directive.directive.path.raw;
              if (typeof raw === 'string' && raw.startsWith('{{') && raw.endsWith('}}') && raw.includes('.')) {
                const inner = raw.substring(2, raw.length - 2);
                const parts = inner.split('.');
                if (parts.length > 1) {
                  fieldPath = parts.slice(1).join('.');
                }
              }
            }
            
            fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
              'Variable name: ' + varName + '\n' +
              'Field path: ' + fieldPath + '\n'
            );
            
            // Resolve the variable value
            let value;
            
            // Try data variable first
            value = state.getDataVar(varName);
            fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
              'Data variable value: ' + JSON.stringify(value) + '\n'
            );
            
            // If not found as data variable, try text variable
            if (value === undefined) {
              value = state.getTextVar(varName);
              fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                'Text variable value: ' + JSON.stringify(value) + '\n'
              );
            }
            
            // If not found as text variable, try path variable
            if (value === undefined && state.getPathVar) {
              value = state.getPathVar(varName);
              fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                'Path variable value: ' + JSON.stringify(value) + '\n'
              );
            }
            
            // Process field access if needed
            if (value !== undefined && fieldPath) {
              try {
                const fields = fieldPath.split('.');
                let current: any = value;
                
                fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                  'Processing field access with fields: ' + JSON.stringify(fields) + '\n'
                );
                
                for (const field of fields) {
                  fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                    'Accessing field: ' + field + ' from: ' + typeof current + ' ' + JSON.stringify(current) + '\n'
                  );
                  
                  if (typeof current === 'object' && current !== null) {
                    if (Array.isArray(current) && !isNaN(Number(field))) {
                      // Handle array index access
                      const index = parseInt(field, 10);
                      if (index >= 0 && index < current.length) {
                        current = current[index];
                      } else {
                        fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                          'Array index out of bounds: ' + index + ' for array length: ' + current.length + '\n'
                        );
                        current = null;
                        break;
                      }
                    } else if (field in current) {
                      // Handle object property access
                      current = current[field];
                    } else {
                      // Field not found
                      fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                        'Field not found in object: ' + field + '\n'
                      );
                      current = null;
                      break;
                    }
                  } else {
                    // Cannot access field on non-object
                    fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                      'Cannot access field on non-object: ' + field + ' value type: ' + typeof current + '\n'
                    );
                    current = null;
                    break;
                  }
                }
                
                if (current !== null) {
                  // Convert to string with proper type handling
                  fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                    'Final field value: ' + JSON.stringify(current) + '\n'
                  );
                  if (typeof current === 'string') {
                    return current;
                  } else if (current === null || current === undefined) {
                    return '';
                  } else if (typeof current === 'object') {
                    return JSON.stringify(current, null, 2);
                  } else {
                    return String(current);
                  }
                }
              } catch (error) {
                fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                  'Error resolving field: ' + error + '\n'
                );
                logger.warn(`Error resolving field ${fieldPath} in variable ${varName}:`, error);
              }
            } else if (value !== undefined) {
              // Convert the whole variable to string if no field path
              fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                'Using whole variable value: ' + JSON.stringify(value) + '\n'
              );
              if (typeof value === 'string') {
                return value;
              } else if (value === null || value === undefined) {
                return '';
              } else if (typeof value === 'object') {
                return JSON.stringify(value, null, 2);
              } else {
                return String(value);
              }
            }
            
            // If we couldn't resolve the variable, log a warning and continue with normal processing
            fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
              'Could not resolve variable reference: ' + varName + '\n'
            );
            logger.warn(`Could not resolve variable reference ${varName} in embed directive`);
          }
          
          
          // For non-variable embeds or if variable resolution failed, continue with normal processing
          // In transformation mode, return the embedded content
          const transformedNodes = state.getTransformedNodes();
          
          // Log all directive details for debugging
          logger.debug('Detailed embed directive information:', {
            node: JSON.stringify(node, null, 2),
            directiveOptions: JSON.stringify(directive.directive, null, 2),
            pathType: typeof directive.directive.path,
            path: directive.directive.path,
            transformedNodesCount: transformedNodes?.length || 0,
            transformedNodeLines: transformedNodes?.map(n => n.location?.start?.line || 'unknown')
          });
          
          if (transformedNodes && transformedNodes.length > 0) {
            // First try exact line match (original behavior)
            const exactMatch = transformedNodes.find(n => 
              n.location?.start?.line === node.location?.start?.line
            );
            
            logger.debug('Looking for transformed embed node', {
              directiveLine: node.location?.start?.line || 'unknown',
              transformedNodeCount: transformedNodes.length,
              foundExactMatch: !!exactMatch,
              exactMatchContent: exactMatch?.type === 'Text' ? (exactMatch as TextNode).content : 'not text node',
              transformedNodeLines: transformedNodes.map(n => n.location?.start?.line || 'unknown')
            });
            
            if (exactMatch && exactMatch.type === 'Text') {
              const content = (exactMatch as TextNode).content;
              logger.debug('Found exact match for embed transformation:', {
                content: content.substring(0, 100),
                contentLength: content.length,
                line: exactMatch.location?.start?.line
              });
              return content.endsWith('\n') ? content : content + '\n';
            }
            
            // If exact match not found, try to find by transformation ID
            // The StateService gives each directive a unique ID for transformation tracking
            const embedId = (node as any).id || (node as any).directiveId;
            if (embedId) {
              // Find the node with matching ID in transformed nodes
              const idMatch = transformedNodes.find(n => (n as any).id === embedId || (n as any).directiveId === embedId);
              
              if (idMatch && idMatch.type === 'Text') {
                const content = (idMatch as TextNode).content;
                logger.debug('Found id match for embed transformation:', {
                  id: embedId,
                  content: content.substring(0, 100),
                  contentLength: content.length,
                  line: idMatch.location?.start?.line
                });
                return content.endsWith('\n') ? content : content + '\n';
              }
            }
            
            // If no ID match, try to find the closest matching node by line number
            // This handles cases where line numbers have shifted during transformation
            let closestNode: MeldNode | null = null;
            let smallestLineDiff = Number.MAX_SAFE_INTEGER;
            
            for (const transformedNode of transformedNodes) {
              if (transformedNode.type === 'Text' && 
                  node.location?.start?.line && 
                  transformedNode.location?.start?.line) {
                
                const lineDiff = Math.abs(
                  transformedNode.location.start.line - node.location.start.line
                );
                
                // Update closest node if this one is closer
                if (lineDiff < smallestLineDiff) {
                  smallestLineDiff = lineDiff;
                  closestNode = transformedNode;
                }
              }
            }
            
            // Use the closest node if it's within a reasonable range (5 lines)
            if (closestNode && smallestLineDiff <= 5) {
              logger.debug('Found closest transformed node for embed directive', {
                originalLine: node.location?.start?.line || 'unknown',
                closestNodeLine: closestNode.location?.start?.line || 'unknown',
                lineDifference: smallestLineDiff,
                nodeType: closestNode.type,
                content: closestNode.type === 'Text' ? 
                  ((closestNode as TextNode).content?.substring(0, 100) + '...') : 
                  'not text node'
              });
              
              const content = (closestNode as TextNode).content;
              return content.endsWith('\n') ? content : content + '\n';
            }
            
            // If still no match, look for content with specific embed directive markers
            const embedPath = directive.directive.path;
            if (embedPath) {
              let embedPathStr = '';
              try {
                // Convert path to string for comparison
                if (typeof embedPath === 'string') {
                  embedPathStr = embedPath;
                } else if (typeof embedPath === 'object' && embedPath !== null) {
                  if ('raw' in embedPath) {
                    embedPathStr = embedPath.raw as string;
                  } else if ('value' in embedPath) {
                    embedPathStr = embedPath.value as string;
                  } else {
                    embedPathStr = JSON.stringify(embedPath);
                  }
                }
                
                // Look for text nodes with content matching this embed path
                for (const transformedNode of transformedNodes) {
                  if (transformedNode.type === 'Text') {
                    const textContent = (transformedNode as TextNode).content;
                    // Skip empty or very short content nodes
                    if (!textContent || textContent.length < 2) continue;
                    
                    // Check if this node looks like it might be our embed content
                    const isLikelyVariableContent = 
                      embedPathStr.includes('{{') && 
                      !textContent.includes('@embed') &&
                      !textContent.includes('[directive');
                      
                    if (isLikelyVariableContent) {
                      logger.debug('Found potential variable embed content match', {
                        embedPath: embedPathStr,
                        content: textContent.substring(0, 100),
                        contentLength: textContent.length,
                        line: transformedNode.location?.start?.line
                      });
                      return textContent.endsWith('\n') ? textContent : textContent + '\n';
                    }
                  }
                }
              } catch (error) {
                logger.warn('Error in content matching for embed directive', {
                  error: error instanceof Error ? error.message : String(error),
                  embedPath
                });
              }
            }
          }
          
          // If we reached here, we couldn't find a transformed node for this embed directive
          logger.warn('No transformed node found for embed directive', {
            directiveLine: node.location?.start?.line || 'unknown',
            directivePath: directive.directive.path,
            transformedNodesAvailable: transformedNodes?.length || 0
          });
          
          // NOTE: Variable-based embed transformations have an issue that will be fixed in Phase 4B
          // For now, we'll add a warning
          if (directive.directive.path && 
              typeof directive.directive.path === 'object' && 
              directive.directive.path !== null &&
              directive.directive.path.isVariableReference === true) {
            logger.warn('Variable-based embed directive transformation will be fixed in Phase 4B', {
              directivePath: directive.directive.path,
              directiveLine: node.location?.start?.line
            });
          }
          
          // Final fallback: return placeholder
          return '[directive output placeholder]\n';
        }

        return '';
      case 'Comment':
        // Comments should be ignored in the output
        logger.debug('Ignoring comment node in output');
        return '';
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'markdown');
    }
  }

  private async nodeToXML(node: MeldNode, state: IStateService): Promise<string> {
    // We need to handle CodeFence nodes explicitly to avoid double-rendering the codefence markers
    if (node.type === 'CodeFence') {
      const fence = node as CodeFenceNode;
      // The content already includes the codefence markers, so we use it as-is
      return fence.content;
    }
    
    // For other node types, use the same logic as markdown for consistent behavior
    return this.nodeToMarkdown(node, state);
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    // The content already includes the codefence markers, so we use it as-is
    return node.content;
  }

  private codeFenceToXML(node: CodeFenceNode): string {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.codeFenceToMarkdown(node);
  }

  /**
   * Format an array based on the formatting context
   * - Block context: Bullet list with each item on a new line 
   * - Inline context: Comma-separated values
   * - Empty arrays: Always as "[]"
   * @param array The array to format
   * @param context The formatting context
   * @returns The formatted array as a string
   */
  private formatArray(array: any[], context: FormattingContext): string {
    // Handle empty arrays consistently
    if (array.length === 0) {
      return '[]';
    }
    
    // In output-literal mode, use consistent JSON.stringify for all arrays
    if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
      try {
        return JSON.stringify(array, null, 2);
      } catch (error) {
        logger.warn('Error stringifying array in output-literal mode', { 
          error: error instanceof Error ? error.message : String(error)
        });
        // Fall through to standard formatting if JSON.stringify fails
      }
    }
    
    // Convert array items to strings
    const formattedItems = array.map(item => {
      // Create a child context for each item, but force inline context for array items
      const itemContext = this.createChildContext(context, context.nodeType);
      itemContext.contextType = 'inline';
      
      // Format each item based on its type
      if (typeof item === 'object' && item !== null) {
        return this.formatObject(item, itemContext);
      } else if (typeof item === 'string') {
        return this.formatString(item, itemContext);
      } else {
        return String(item);
      }
    });

    // Different formatting based on context
    if (context.contextType === 'block' && !context.specialMarkdown) {
      // In block context (but not in special markdown), create a bullet list
      const bulletList = formattedItems.map(item => `- ${item}`).join('\n');
      
      // If not at the start of a line, add a leading newline
      return context.atLineStart ? bulletList : '\n' + bulletList;
    }
    
    // For inline context or within special markdown (table, etc.), use comma-separated
    return formattedItems.join(', ');
  }

  /**
   * Format an object based on the formatting context
   * - Block context (not in code fence): Fenced code block with pretty-printed JSON
   * - Code fence context: Pretty-printed JSON without the fence
   * - Inline context: Compact JSON
   * @param obj The object to format
   * @param context The formatting context
   * @returns The formatted object as a string
   */
  private formatObject(obj: object, context: FormattingContext): string {
    // Handle null check
    if (obj === null) {
      return '';
    }
    
    // Empty object
    if (Object.keys(obj).length === 0) {
      return '{}';
    }
    
    try {
      // In output-literal mode, use consistent JSON.stringify without code fences
      if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
        return JSON.stringify(obj, null, 2);
      }
      
      // Standard mode processing follows
      
      // Block context and not already in a code fence
      if (context.contextType === 'block' && context.specialMarkdown !== 'code') {
        // Pretty print with code fence
        const jsonString = JSON.stringify(obj, null, 2);
        const codeBlock = '```json\n' + jsonString + '\n```';
        
        // If not at the start of a line, add a leading newline
        return context.atLineStart ? codeBlock : '\n' + codeBlock;
      }
      
      // Already in a code fence - don't add another one
      if (context.specialMarkdown === 'code') {
        return JSON.stringify(obj, null, 2);
      }
      
      // Inline context - compact JSON
      return JSON.stringify(obj);
    } catch (error) {
      logger.error('Error formatting object', { error });
      return '{}'; // Fallback
    }
  }

  /**
   * Format a string based on the formatting context
   * - Block context: Preserve newlines
   * - Inline context: Convert newlines to spaces
   * @param str The string to format
   * @param context The formatting context
   * @returns The formatted string
   */
  private formatString(str: string, context: FormattingContext): string {
    if (!str) return '';
    
    const hasNewlines = str.includes('\n');
    
    // In output-literal mode or when preserve formatting is enabled, preserve all formatting exactly
    if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
      return str;
    }
    
    // In inline context, convert newlines to spaces to avoid breaking the line
    if (context.contextType === 'inline' && hasNewlines) {
      return str.replace(/\n+/g, ' ');
    }
    
    // In block context, leave newlines as they are but trim trailing newlines
    // unless we're in a special context where preserving them is important
    if (context.contextType === 'block' && hasNewlines && !context.specialMarkdown) {
      return str.replace(/\n+$/g, '');
    }
    
    // For all other cases, return as is
    return str;
  }
}

function isDataVarNode(node: MeldNode): node is any {
  const anyNode = node as any;
  // Check for new-style VariableReference node with valueType 'data'
  if (anyNode.type === 'VariableReference' && anyNode.valueType === 'data') {
    return true;
  }
  // Check for legacy DataVar node type
  if (anyNode.type === 'DataVar') {
    return true;
  }
  return false;
}