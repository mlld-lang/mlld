import { injectable, inject, delay } from 'tsyringe';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { MeldNode, TextNode, CodeFenceNode, VariableReferenceNode, DirectiveNode } from '@core/syntax/types/index';
import { logger } from '@core/utils/logger';
import type { IOutputService } from './IOutputService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { ResolutionContext } from '@core/types/resolution';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { IVariableReferenceResolverClient, FieldAccessOptions } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory';
import { VariableType } from '@core/types/variables';
import { StateService } from '@services/state/StateService/StateService';
import { Service } from '@core/ServiceProvider';
import { createLLMXML } from 'llmxml';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import { MeldOutputError } from '@core/errors/MeldOutputError';
import { MeldError } from '@core/errors/MeldError';
import { formatWithPrettier } from '@core/utils/prettierUtils';
import type { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference';
import { container } from 'tsyringe';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';

/**
 * Options for output generation
 */
interface OutputOptions {
  /** Whether to pretty print the output */
  pretty?: boolean;
  /** Whether to preserve exact formatting from source */
  preserveFormatting?: boolean;
  /** Whether to preserve variable types in output */
  preserveTypes?: boolean;
  /** Default format to use for unknown node types */
  defaultFormat?: string;
  /** Current file path for error reporting */
  currentFilePath?: string;
  /** Whether to run in strict mode */
  strict?: boolean;
  /** Format-specific options */
  formatOptions?: {
    /** Pre-rendered markdown content */
    markdown?: string;
  };
}

/** Default output options */
const DEFAULT_OPTIONS: OutputOptions = {
  pretty: false,
  preserveFormatting: true,
  preserveTypes: false,
  defaultFormat: 'text'
};

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

@injectable()
@Service({
  description: 'Service responsible for converting Meld nodes to different output formats',
  dependencies: [
    { token: 'IStateService', name: 'state', optional: true },
    { token: 'IResolutionService', name: 'resolutionService' },
    { token: 'ResolutionServiceClientFactory', name: 'resolutionServiceClientFactory', optional: true },
    { token: 'VariableReferenceResolverClientFactory', name: 'variableResolverClientFactory', optional: true },
    { token: 'VariableNodeFactory', name: 'variableNodeFactory', optional: true } 
  ]
})
export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();
  private state: IStateService | undefined;
  private resolutionService!: IResolutionService; 
  private resolutionClient?: IResolutionServiceClient;
  private variableResolver?: IVariableReferenceResolverClient;
  private fieldAccessHandler: FieldAccessHandler;
  private contextStack: FormattingContext[] = [];

  private readonly variableNodeFactory?: VariableNodeFactory;

  constructor(
    @inject('IResolutionService') resolutionService: IResolutionService,
    @inject('IStateService') state?: IStateService,
    @inject('ResolutionServiceClientFactory') resolutionServiceClientFactory?: ResolutionServiceClientFactory,
    @inject(delay(() => VariableReferenceResolverClientFactory)) variableResolverClientFactory?: VariableReferenceResolverClientFactory,
    @inject('VariableNodeFactory') variableNodeFactory?: VariableNodeFactory
  ) {
    this.variableNodeFactory = variableNodeFactory;
    
    this.resolutionService = resolutionService; 

    if (resolutionServiceClientFactory) {
      try {
        this.resolutionClient = resolutionServiceClientFactory.createClient();
      } catch (error) {
        logger.warn('Failed to create resolution client', { error });
      } 
    }
    if (variableResolverClientFactory) {
      try {
        this.variableResolver = variableResolverClientFactory.createClient();
      } catch (error) {
        logger.warn('Failed to create variable resolver client', { error });
      }
    }
    
    this.fieldAccessHandler = new FieldAccessHandler(
      this.resolutionClient,
      () => this.getVariableResolver()
    );
    
    this.initializeFromParams(this.resolutionService, state, resolutionServiceClientFactory);
  }

  public canAccessTransformedNodes(): boolean {
    return true;
  }

  /**
   * Gets (or creates) the variable reference resolver client using direct container resolution
   * This method uses lazy loading to avoid circular dependencies during initialization
   * @returns The variable reference resolver client or undefined if resolution fails
   */
  getVariableResolver(): IVariableReferenceResolverClient | undefined {
    if (!this.variableResolver) {
      try {
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

  private initializeFromParams(
    resolutionService: IResolutionService, 
    state?: IStateService,
    resolutionServiceClientFactory?: ResolutionServiceClientFactory
  ): void {
    this.registerDefaultFormatters();
    this.state = state;
    logger.debug('OutputService initialized with state service', {
      hasResolutionService: !!(resolutionService as IResolutionService), 
      hasResolutionClient: !!this.resolutionClient,
      hasStateService: !!state
    });
  }

  private registerDefaultFormatters(): void {
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('xml', this.convertToXML.bind(this));
    logger.debug('Registered default format converters: markdown, md, xml');
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
   * @deprecated Use dependency injection instead of manual initialization.
   * This method is kept for backward compatibility but will be removed in a future version.
   */
  initialize(state: IStateService, resolutionService: IResolutionService): void {
    this.state = state;
    this.resolutionService = resolutionService;
    logger.debug('OutputService manually initialized with state service', {
      hasResolutionService: true
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: string,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    logger.debug('[OutputService convert ENTRY]', {
      format,
      passedNodeCount: nodes?.length ?? 0,
      passedFirstNodeType: nodes?.[0]?.type,
      passedFirstNodeId: nodes?.[0]?.nodeId,
      stateId: state?.getStateId()
    });

    const formatter = this.formatters.get(format);
    if (!formatter) {
      const supported = this.getSupportedFormats().join(', ');
      throw new Error(`Unsupported output format: ${format}. Supported formats: ${supported}`);
    }

    try {
      let result = await formatter(nodes, state, opts);
      
      if (opts.pretty) {
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
        transformedNodesCount: nodes.length,
        pretty: opts.pretty
      });

      // process.stdout.write(`>>> OutputService.convert returning: ${JSON.stringify(result)}\n`);

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
    if (value === null || value === undefined) {
      return '';
    }
    
    const currentContext = this.getCurrentFormattingContext();
    
    const fieldOptions: FieldAccessOptions = {
      preserveType: formatOptions?.preserveType ?? false,
      formattingContext: {
        isBlock: formatOptions?.context === 'block',
        nodeType: 'Text', // Default to Text node
        linePosition: 'middle', // Default to middle of line
        isTransformation: currentContext.transformationMode
      }
    };
    
    if (this.variableResolver) {
      try {
        const resolvedValue = this.variableResolver.convertToString(value, fieldOptions);
        logger.debug('Resolved value using resolver client', { resolvedValue });
        return resolvedValue;
      } catch (error) {
        logger.warn('Failed to convert using resolver client, falling back to direct conversion', { error });
      }
    }
    
    if (Array.isArray(value)) {
      return this.formatArray(value, currentContext);
    } else if (typeof value === 'object' && value !== null) {
      return this.formatObject(value, currentContext);
    } else if (typeof value === 'string') {
      return this.formatString(value, currentContext);
    } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    
    return String(value);
  }

  /**
   * Helper method to safely extract string content from various node types
   * ensuring proper type safety
   */
  private getTextContentFromNode(node: any): string {
    if (node === undefined || node === null) {
      return '';
    }
    
    if ('id' in node && typeof node.id === 'string') {
      return node.id;
    }
    
    if ('identifier' in node && typeof node.identifier === 'string') {
      return node.identifier;
    }
    
    if ('text' in node && node.text !== undefined && node.text !== null) {
      return String(node.text);
    }
    
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
    
    return '';
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    let output = '';
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.contextStack = [this.createFormattingContext('document', true)];

    logger.debug('[OutputService convertToMarkdown] Entry', {
      nodeCount: nodes?.length ?? 0,
      firstNodeType: nodes?.[0]?.type,
      stateId: state?.getStateId(),
      isTransformationEnabled: state?.isTransformationEnabled(),
      transformedNodeCountInState: state?.getTransformedNodes()?.length
    });
    if (nodes && nodes.length > 0) {
      logger.debug('[OutputService convertToMarkdown] First 3 nodes:', {
        nodes: nodes.slice(0, 3).map(n => ({ type: n.type, nodeId: n.nodeId, content: (n as any).content?.substring(0, 50) }))
      });
    }

    for (const node of nodes) { 
      const currentContext = this.getCurrentFormattingContext();

      // process.stdout.write(`>>> convertToMarkdown Loop: Processing node type: ${node.type}, ID: ${node.nodeId}\n`);

      if (node.type === 'Text') {
        const textNode = node as TextNode;
        const handledContent = this.handleNewlines(textNode.content, currentContext);
        // process.stdout.write(`    Appending Text content: "${handledContent}"\n`);
        output += handledContent;
      } else if (node.type === 'VariableReference') { 
          const varNode = node as VariableReferenceNode;
          const resolutionContext = ResolutionContextFactory.create(state, opts.currentFilePath || state?.getCurrentFilePath() || '/unknown/path').withStrictMode(opts.strict ?? DEFAULT_OPTIONS.strict ?? false);
          try {
              const resolvedValue = await this.resolutionService.resolveNodes([varNode], resolutionContext);
              const handledContent = this.handleNewlines(resolvedValue, currentContext);
              // process.stdout.write(`    Resolving ${varNode.identifier} -> Appending Text content: "${handledContent}"\n`);
              output += handledContent;
          } catch (error) {
              logger.error(`[OutputService] Error resolving variable reference ${varNode.identifier} in context ${resolutionContext.currentFilePath}:`, error);
              // process.stdout.write(`    Error resolving variable reference ${varNode.identifier}. Appending placeholder.\n`);
              output += `{{ERROR: ${varNode.identifier}}}`;
          }
      } else if (node.type === 'CodeFence') {
        const fenceContent = this.codeFenceToMarkdown(node as CodeFenceNode);
        // process.stdout.write(`    Appending CodeFence content: "${fenceContent.substring(0,50)}..."\n`);
        output += fenceContent;
      } else {
        // process.stdout.write(`    Ignoring node type: ${node.type}\n`);
      }

      const endsWithNewline = output.endsWith('\n');
      if (this.contextStack.length > 0) { 
          const context = this.getCurrentFormattingContext();
          context.atLineStart = endsWithNewline;
          context.atLineEnd = false; 
          context.lastOutputEndedWithNewline = endsWithNewline;
      }
    }
    
    return output;
  }

  private async convertToXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    try {
      let markdown;
      
      if (options?.formatOptions?.markdown) {
        markdown = options.formatOptions.markdown as string;
      } else {
        markdown = await this.convertToMarkdown(nodes, state, options);
      }
      
      logger.debug('Converting markdown to XML', { markdown });

      const llmxml = createLLMXML();
      const xmlResult = await llmxml.toXML(markdown);
      
      logger.debug('Successfully converted to XML', { xmlLength: xmlResult.length });
      return xmlResult;
    } catch (error) {
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

    const stateService = state as StateService;

    const textVars = stateService.getAllTextVars();
    if (textVars.size > 0) {
      output += '# Text Variables\n\n';
      for (const textVar of textVars.values()) {
        output += `@text ${textVar.name} = "${textVar.value}"\n`;
      }
    }

    const dataVars = stateService.getAllDataVars();
    if (dataVars.size > 0) {
      if (output) output += '\n\n';
      output += '# Data Variables\n\n';
      for (const dataVar of dataVars.values()) {
        output += `@data ${dataVar.name} = ${JSON.stringify(dataVar.value, null, 2)}\n`;
      }
    }

    return output;
  }

  private async nodeToMarkdown(node: MeldNode, state: IStateService): Promise<string> {
    logger.debug('Processing node in nodeToMarkdown', {
      nodeType: node.type,
      nodeStructure: Object.keys(node),
      location: node.location,
      isTransformationEnabled: state.isTransformationEnabled(),
      transformedNodeCountInState: state.getTransformedNodes()?.length,
      contextStackDepth: this.contextStack.length,
      hasPreviousContext: this.contextStack.length > 0
    });

    const previousContext = this.contextStack.length > 0 
      ? this.contextStack[this.contextStack.length - 1] 
      : null;
    
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
        
        const formattingContext = this.createFormattingContext(
          'Text', 
          state.isTransformationEnabled()
        );
        
        if (textNode.formattingMetadata) {
          logger.debug('Found formatting metadata in Text node', {
            isFromDirective: textNode.formattingMetadata.isFromDirective,
            originalNodeType: textNode.formattingMetadata.originalNodeType,
            preserveFormatting: textNode.formattingMetadata.preserveFormatting,
            contentLength: content.length
          });
          
          if (textNode.formattingMetadata.isFromDirective && textNode.formattingMetadata.originalNodeType) {
            formattingContext.nodeType = textNode.formattingMetadata.originalNodeType;
            
            if (textNode.formattingMetadata.preserveFormatting) {
              formattingContext.transformationMode = true;
              formattingContext.isOutputLiteral = true;
              formattingContext.preserveFormatting = true;
            }
          }
        }
        
        if (previousContext) {
          formattingContext.lastOutputEndedWithNewline = previousContext.lastOutputEndedWithNewline;
          formattingContext.atLineStart = previousContext.lastOutputEndedWithNewline;
          formattingContext.parentContext = previousContext;
        }
        
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
        
        formattingContext.atLineStart = content.startsWith('\n') || 
                                        !content.trim() || 
                                        content.trim().startsWith('\n');
        
        formattingContext.atLineEnd = content.endsWith('\n');
        
        if (content.includes('\n')) {
          formattingContext.contextType = 'block';
        } else if (/^#{1,6}\s/.test(content.trim())) {
          formattingContext.contextType = 'block';
          formattingContext.specialMarkdown = 'heading';
        } else if (/^[-*+]\s/.test(content.trim()) || /^\d+\.\s/.test(content.trim())) {
          formattingContext.contextType = 'block';
          formattingContext.specialMarkdown = 'list';
        } else if (/^\|.*\|/.test(content.trim()) || content.includes('|')) {
          formattingContext.contextType = 'inline';
          formattingContext.specialMarkdown = 'table';
        } else {
          formattingContext.contextType = 'inline';
        }
        
        return this.handleNewlines(content, formattingContext);
      case 'VariableReference':
        try {
          const varNode = node as IVariableReference;
          
          let serializedString = `{{${varNode.identifier}`;
          if (varNode.fields && varNode.fields.length > 0) {
            const fieldString = varNode.fields.map(field => {
              if (field.type === 'field') {
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

          let resolvedValue = serializedString; // Default to serialized string if resolution fails
          if (this.resolutionService && state) { 
            try {
              const resolveContext: ResolutionContext = ResolutionContextFactory.create(state, state.getCurrentFilePath() ?? undefined).withStrictMode(true);

              resolvedValue = await this.resolutionService.resolveInContext(serializedString, resolveContext);
              logger.debug(`Resolved VariableReferenceNode ${varNode.identifier} via resolveInContext to: ${resolvedValue}`);

            } catch (error) {
              logger.error('Error resolving VariableReference node via resolveInContext', { 
                serializedString,
                error: error instanceof Error ? error.message : String(error) 
              });
            }
          } else {
             logger.warn('ResolutionService or StateService not available for VariableReference node processing');
          }
          
          return resolvedValue;
        } catch (error) {
          logger.error('Error processing VariableReference node', { 
            node: JSON.stringify(node), 
            error: error instanceof Error ? error.message : String(error) 
          });
          const identifier = (node as IVariableReference).identifier || 'error';
          const fields = (node as IVariableReference).fields?.map(f => f.value).join('.') || '';
          return `{{${identifier}${fields ? '.' + fields : ''}}}`; 
        }
      case 'CodeFence':
        const fence = node as CodeFenceNode;
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

        if (['text', 'data', 'path', 'import', 'exec'].includes(kind)) {
          return '';
        }

        if (kind === 'run') {
          if (!state.isTransformationEnabled()) {
            const formattingContext = this.createFormattingContext(
              'Directive', 
              false // not in transformation mode
            );
            
            const placeholder = '[run directive output placeholder]';
            
            return placeholder + '\n\n';
          }
          
          const transformedNodes = state.getTransformedNodes();
          if (transformedNodes && transformedNodes.length > 0) {
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
            
            let closestNode: MeldNode | null = null;
            let smallestLineDiff = Number.MAX_SAFE_INTEGER;
            
            for (const transformedNode of transformedNodes) {
              if (transformedNode.type === 'Text' && 
                  node.location?.start.line && 
                  transformedNode.location?.start.line) {
                
                const lineDiff = Math.abs(
                  transformedNode.location.start.line - node.location.start.line
                );
                
                if (lineDiff < smallestLineDiff) {
                  smallestLineDiff = lineDiff;
                  closestNode = transformedNode;
                }
              }
            }
            
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
          
          logger.warn('No transformed node found for run directive', {
            directiveLine: node.location?.start.line,
            command: directive.directive.command
          });
          return '[run directive output placeholder]\n';
        }

        return '';
      case 'Comment':
        logger.debug('Ignoring comment node in output');
        return '';
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'markdown');
    }
  }

  private async nodeToXML(node: MeldNode, state: IStateService): Promise<string> {
    if (node.type === 'CodeFence') {
      const fence = node as CodeFenceNode;
      return fence.content;
    }
    
    return this.nodeToMarkdown(node, state);
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    return node.content;
  }

  private codeFenceToXML(node: CodeFenceNode): string {
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
    if (array.length === 0) {
      return '[]';
    }
    
    if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
      try {
        return JSON.stringify(array, null, 2);
      } catch (error) {
        logger.warn('Error stringifying array in output-literal mode', { 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    const formattedItems = array.map(item => {
      const itemContext = this.createChildContext(context, context.nodeType);
      itemContext.contextType = 'inline';
      
      if (typeof item === 'object' && item !== null) {
        return this.formatObject(item, itemContext);
      } else if (typeof item === 'string') {
        return this.formatString(item, itemContext);
      } else {
        return String(item);
      }
    });

    if (context.contextType === 'block' && !context.specialMarkdown) {
      return formattedItems.map(item => `- ${item}`).join('\n');
    }
    
    if (context.specialMarkdown === 'table' || context.specialMarkdown === 'list') {
      return formattedItems.join(', ');
    }
    
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
    if (obj === null) {
      return '';
    }
    
    if (Object.keys(obj).length === 0) {
      return '{}';
    }
    
    try {
      if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
        return JSON.stringify(obj, null, 2);
      }
      
      if (context.contextType === 'block' && context.specialMarkdown !== 'code') {
        const jsonString = JSON.stringify(obj, null, 2);
        const codeBlock = '```json\n' + jsonString + '\n```';
        
        if (!context.atLineStart) {
          return '\n' + codeBlock;
        }
        return codeBlock;
      }
      
      if (context.specialMarkdown === 'code') {
        return JSON.stringify(obj, null, 2);
      }
      
      return JSON.stringify(obj);
    } catch (error) {
      logger.error('Error formatting object', { error });
      return '{}'; 
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
    
    if ((context.isOutputLiteral ?? context.transformationMode) || context.preserveFormatting) {
      return str;
    }
    
    if (context.contextType === 'inline' && hasNewlines) {
      return str.replace(/\n+/g, ' ');
    }
    
    if (context.contextType === 'block' && hasNewlines && !context.specialMarkdown) {
      return str.replace(/\n+$/g, '');
    }
    
    return str;
  }
}

function isDataVarNode(node: MeldNode): node is any {
  const anyNode = node as any;
  if (anyNode.type === 'VariableReference' && anyNode.valueType === 'data') {
    return true;
  }
  if (anyNode.type === 'DataVar') {
    return true;
  }
  return false;
}