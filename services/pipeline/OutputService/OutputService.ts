import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { MeldError } from '@core/errors/MeldError.js';
import { inject, injectable, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { IVariableReferenceResolverClient, FieldAccessOptions } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';

/**
 * Tracking context for variable formatting to preserve formatting during substitution
 */
interface FormattingContext {
  /** Current node type being processed */
  nodeType: string;
  /** Whether we're in transformation mode */
  transformationMode: boolean;
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
   */
  convertToString(value: any, options?: {
    pretty?: boolean,
    preserveType?: boolean,
    context?: 'inline' | 'block'
  }): string {
    // Try to use the VariableReferenceResolverClient if available
    if (this.getVariableResolver) {
      const resolver = this.getVariableResolver();
      if (resolver) {
        try {
          // Map our options to the client's expected format
          const fieldOptions: FieldAccessOptions = {
            preserveType: options?.preserveType ?? false,
            formattingContext: {
              isBlock: options?.context === 'block',
              nodeType: 'Text',
              linePosition: 'middle',
              isTransformation: false
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

    // Fall back to direct string conversion

    // Extract options with defaults
    const {
      pretty = false,
      preserveType = false,
      context = 'inline'
    } = options || {};
    
    // Handle undefined or null
    if (value === undefined || value === null) {
      return '';
    }
    
    // Return strings directly
    if (typeof value === 'string') {
      return value;
    }
    
    // Convert basic primitives
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    // Handle arrays with consistent formatting
    if (Array.isArray(value)) {
      // Empty array
      if (value.length === 0) {
        return preserveType ? '[]' : '';
      }
      
      // Convert each item
      const items = value.map(item => this.convertToString(item, { 
        pretty: false,  // Don't prettify nested items in arrays
        preserveType,
        context: 'inline' // Use inline context for array items
      }));
      
      // Format differently based on context
      if (context === 'block' && items.length > 3) {
        // For block context with many items, use a list format
        return items.map(item => `- ${item}`).join('\n');
      }
      
      // Default array formatting (comma-separated)
      return items.join(', ');
    }
    
    // Handle objects
    if (typeof value === 'object') {
      try {
        // Empty object
        if (Object.keys(value).length === 0) {
          return preserveType ? '{}' : '';
        }
        
        // Use pretty printing for block context
        if (pretty || context === 'block') {
          return JSON.stringify(value, null, 2);
        }
        
        // Default object formatting
        return JSON.stringify(value);
      } catch (error) {
        logger.error('Error stringifying object', { value, error });
        return '[Object]';
      }
    }
    
    // Default fallback
    return String(value);
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
    @inject('ResolutionServiceClientFactory') resolutionServiceClientFactory?: ResolutionServiceClientFactory
  ) {
    this.initializeFromParams(state, resolutionService, resolutionServiceClientFactory);
    
    // Initialize field access handler with access to the variable resolver method
    // This allows the handler to use the resolver when needed without creating circular dependencies
    this.fieldAccessHandler = new FieldAccessHandler(
      this.resolutionClient,
      this.getVariableResolver.bind(this)
    );
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
      transformationEnabled: state.isTransformationEnabled()
    });

    // Use transformed nodes if transformation is enabled
    const nodesToProcess = state.isTransformationEnabled() 
      ? state.getTransformedNodes() 
      : nodes;

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodesToProcess, state, opts);
      
      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length,
        transformationEnabled: state.isTransformationEnabled(),
        transformedNodesCount: state.isTransformationEnabled() ? state.getTransformedNodes().length : 0
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error
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
   * @param transformationMode Whether in transformation mode
   * @returns A new formatting context object
   */
  private createFormattingContext(nodeType: string, transformationMode: boolean): FormattingContext {
    return {
      nodeType,
      transformationMode,
      contextType: 'block', // Default to block context
      atLineStart: true,
      atLineEnd: false,
      indentation: '',
      lastOutputEndedWithNewline: false
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
      const defaultContext = this.createFormattingContext('Text', false);
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
    
    // In transformation mode, preserve exact newlines
    if (context.transformationMode) {
      return content;
    }
    
    // In standard mode, normalize newlines based on context
    if (context.contextType === 'block') {
      // For block content, ensure proper paragraph spacing
      if (!content.endsWith('\n')) {
        content += '\n';
      }
      
      if (!content.endsWith('\n\n') && !context.lastOutputEndedWithNewline) {
        content += '\n';
      }
      
      // Normalize multiple consecutive newlines to double newlines
      content = content.replace(/\n{3,}/g, '\n\n');
    } else {
      // For inline content, remove trailing newlines
      content = content.replace(/\n+$/g, '');
    }
    
    return content;
  }

  /**
   * Process a variable reference with context-aware formatting
   * Uses the VariableReferenceResolverClient when available for enhanced field access
   * 
   * @param reference The variable reference to process (e.g., "user.name")
   * @param context The formatting context
   * @param state The state service
   * @returns The resolved variable value with proper formatting
   */
  private async processVariableReference(
    reference: string, 
    context: FormattingContext, 
    state: IStateService
  ): Promise<string> {
    try {
      // Parse the reference
      if (!reference) return '';
      
      // Split into variable name and field path
      const parts = reference.split('.');
      const varName = parts[0];
      const fieldPath = parts.length > 1 ? parts.slice(1).join('.') : '';

      // Try to use the VariableReferenceResolverClient if available and we have a field path
      if (fieldPath) {
        const resolver = this.getVariableResolver();
        if (resolver) {
          try {
            // Create a resolution context for field access
            const resolutionContext: ResolutionContext = ResolutionContextFactory.create(
              undefined, // current file path not needed for this operation
              state
            );
            
            // Field access options with proper formatting context
            const fieldOptions: FieldAccessOptions = {
              preserveType: false,
              variableName: varName,
              formattingContext: {
                isBlock: context.contextType === 'block',
                nodeType: context.nodeType,
                linePosition: context.atLineStart ? 'start' : (context.atLineEnd ? 'end' : 'middle'),
                isTransformation: context.transformationMode
              }
            };
            
            // Try to resolve the field access directly
            // This combined approach handles all variable types in one operation
            const result = await resolver.resolveFieldAccess(varName, fieldPath, resolutionContext, fieldOptions);
            
            logger.debug('Field access resolved using variable resolver client', {
              varName,
              fieldPath,
              resultType: result !== undefined ? typeof result : 'undefined',
              success: result !== undefined
            });
            
            // If we got a result, convert it to string with the resolver's formatter
            if (result !== undefined) {
              return resolver.convertToString(result, fieldOptions);
            }
            
            // Fall through to standard resolution if resolver didn't find the variable
          } catch (resolverError) {
            logger.warn('Error using variable resolver client for field access, falling back', {
              varName,
              fieldPath,
              error: resolverError instanceof Error ? resolverError.message : String(resolverError)
            });
            // Continue with standard resolution
          }
        }
      }
      
      // Standard variable resolution approach if client is not available or fails
      
      // Try to get the variable value
      let value;
      
      // Try text variable first
      value = state.getTextVar(varName);
      
      logger.debug('Looking up variable in state', {
        varName,
        value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined',
        type: 'text'
      });
      
      // If not found as text variable, try data variable
      if (value === undefined) {
        value = state.getDataVar(varName);
        logger.debug('Looking up data variable in state', {
          varName,
          value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined',
          type: 'data'
        });
      }
      
      // If not found as data variable, try path variable
      if (value === undefined && state.getPathVar) {
        value = state.getPathVar(varName);
        logger.debug('Looking up path variable in state', {
          varName,
          value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined',
          type: 'path'
        });
      }
      
      // Variable not found
      if (value === undefined) {
        logger.warn('Variable not found', { varName, fieldPath });
        return '';
      }
      
      // Process field access
      if (fieldPath) {
        try {
          // Create a resolution context for field access
          const resolutionContext: ResolutionContext = ResolutionContextFactory.create(
            undefined, // current file path not needed for this operation
            state
          );
          
          // Use field access handler to get the field value
          value = await this.fieldAccessHandler.accessField(value, fieldPath, resolutionContext, {
            strict: false,
            defaultValue: '',
            variableName: varName,
            preserveType: false
          });
          
          logger.debug('Field access result', {
            varName,
            fieldPath,
            result: value !== undefined ? 
              (typeof value === 'string' ? value : JSON.stringify(value)) : 
              'undefined'
          });
        } catch (error) {
          logger.error('Error accessing field', {
            varName,
            fieldPath,
            error: error instanceof Error ? error.message : String(error)
          });
          return '';
        }
      }
      
      // Convert to string with appropriate formatting
      const formatOptions = {
        pretty: context.contextType === 'block',
        preserveType: false,
        context: context.contextType
      };
      
      return this.fieldAccessHandler.convertToString(value, formatOptions);
    } catch (error) {
      logger.error('Error processing variable reference', {
        reference,
        error: error instanceof Error ? error.message : String(error)
      });
      return '';
    }
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
    context?: 'inline' | 'block'
  }): string {
    // Use the field access handler's convertToString method
    // It will try to use the variable resolver client when available
    return this.fieldAccessHandler.convertToString(value, formatOptions);
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
        transformationEnabled: state.isTransformationEnabled()
      });

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Transformation mode handling 
      // In transformation mode, we need to preserve the exact layout without adding newlines
      if (state.isTransformationEnabled()) {
        // Process nodes with careful handling of newlines
        for (const node of nodes) {
          try {
            // Get the node output
            const nodeOutput = await this.nodeToMarkdown(node, state);
            
            // Skip empty outputs
            if (!nodeOutput) continue;
            
            // Add to output buffer
            output += nodeOutput;
          } catch (nodeError) {
            // Log detailed error for the specific node
            logger.error('Error converting node to markdown in transformation mode', {
              nodeType: node.type,
              location: node.location,
              error: nodeError
            });
            throw nodeError;
          }
        }
        
        // Cleanup excessive whitespace without losing the basic text layout
        output = output.replace(/\n{3,}/g, '\n\n');
        
        return output;
      }
      
      // Standard mode processing (non-transformation)
      // Process nodes
      for (const node of nodes) {
        try {
          const nodeOutput = await this.nodeToMarkdown(node, state);
          if (nodeOutput) {
            output += nodeOutput;
          }
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

      // Clean up extra newlines if not preserving formatting
      if (!opts.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
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

      // Use llmxml directly with version 1.3.0+
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: 0.7,
        includeHlevel: false,
        includeTitle: false,
        tagFormat: 'PascalCase',
        verbose: false,
        warningLevel: 'all'
      });
      
      // Convert markdown to XML using llmxml
      const xmlResult = await llmxml.toXML(markdown);
      logger.debug('Successfully converted to XML', { xmlLength: xmlResult.length });
      return xmlResult;
    } catch (error) {
      logger.error('Error in convertToXML', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw new MeldOutputError(
        `Failed to convert output to XML: ${error instanceof Error ? error.message : String(error)}`,
        'xml',
        { cause: error instanceof Error ? error : undefined }
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
      location: node.location
    });

    switch (node.type) {
      case 'Text':
        const content = (node as TextNode).content;
        
        // Create a formatting context for this node
        const formattingContext = this.createFormattingContext(
          'Text', 
          state.isTransformationEnabled()
        );
        
        // Check if text starts at beginning of line
        formattingContext.atLineStart = content.startsWith('\n') || !content.trim();
        
        // Check if text ends at end of line
        formattingContext.atLineEnd = content.endsWith('\n');
        
        // Determine if this is block or inline context
        formattingContext.contextType = content.includes('\n') ? 'block' : 'inline';
        
        // In transformation mode, directly replace variable references with their values
        if (state.isTransformationEnabled() && content.includes('{{')) {
          const variableRegex = /\{\{([^{}]+)\}\}/g;
          let transformedContent = content;
          const matches = Array.from(content.matchAll(variableRegex));
          
          logger.debug('Found variable references in Text node', {
            content,
            matches: matches.map(m => m[0]),
            transformationEnabled: state.isTransformationEnabled(),
            transformationOptions: state.getTransformationOptions ? state.getTransformationOptions() : 'N/A',
            shouldTransformVariables: state.shouldTransform ? state.shouldTransform('variables') : 'N/A'
          });
          
          // If no matches, return original content with proper newline handling
          if (matches.length === 0) {
            // In transformation mode, preserve original newline handling
            return this.handleNewlines(content, formattingContext);
          }
          
          // Only proceed with transformation if we're supposed to transform variables
          if (!state.shouldTransform || state.shouldTransform('variables')) {
            // Process each variable reference
            for (const match of matches) {
              const fullMatch = match[0]; // The entire match, e.g., {{variable}}
              const reference = match[1].trim(); // The variable reference, e.g., variable
              
              try {
                // Using our context-aware variable processor
                const resolvedValue = await this.processVariableReference(reference, formattingContext, state);
                
                // Replace the variable reference while preserving formatting
                transformedContent = transformedContent.replace(fullMatch, resolvedValue);
                
                logger.debug('Replaced variable reference in Text node', {
                  reference,
                  resolvedValue,
                  fullMatch,
                  before: content,
                  after: transformedContent
                });
              } catch (error) {
                // Handle errors during variable resolution
                logger.error('Error resolving variable reference:', {
                  fullMatch,
                  reference,
                  error: error instanceof Error ? error.message : String(error)
                });
                // Leave the variable reference unchanged on error
              }
            }
            
            // Apply proper newline handling for transformation mode
            return this.handleNewlines(transformedContent, formattingContext);
          }
        }
        
        // Check if the content contains variable references and ResolutionService is available
        if (content.includes('{{')) {
          try {
            // Create appropriate resolution context for text variables
            const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
              undefined, // current file path not needed here
              state // state service to use
            );
            
            // First try the resolution client if available
            if (this.resolutionClient) {
              try {
                const resolvedContent = await this.resolutionClient.resolveText(content, context);
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
                const resolvedContent = await this.resolutionService.resolveText(content, context);
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
            
            for (const match of matches) {
              const fullMatch = match[0]; // The entire match, e.g., {{variable}}
              const reference = match[1].trim(); // The variable reference, e.g., variable
              
              // Using our context-aware variable processor
              const resolvedValue = await this.processVariableReference(reference, formattingContext, state);
              
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
      case 'TextVar':
        // Handle TextVar nodes
        try {
          // Create a formatting context for this node
          const formattingContext = this.createFormattingContext(
            'TextVar', 
            state.isTransformationEnabled()
          );
          
          logger.debug('TextVar node detailed view', {
            hasId: 'id' in node,
            idValue: 'id' in node ? node.id : 'undefined',
            hasIdentifier: 'identifier' in node,
            identifierValue: 'identifier' in node ? node.identifier : 'undefined',
            hasText: 'text' in node,
            textValue: 'text' in node ? node.text : 'undefined',
            hasValue: 'value' in node,
            valueValue: 'value' in node ? node.value : 'undefined',
            hasContent: 'content' in node,
            contentValue: 'content' in node ? (node as any).content : 'undefined',
            nodeStr: JSON.stringify(node, null, 2)
          });
          
          // Try various possible property names and resolve from state
          let textVarContent = '';
          let variableIdentifier = '';
          
          if ('id' in node) {
            // Try to resolve from state using id
            variableIdentifier = node.id as string;
            textVarContent = state.getTextVar(variableIdentifier) || '';
            logger.debug(`Trying to resolve TextVar with id ${variableIdentifier}`, {
              resolved: textVarContent || 'NOT RESOLVED'
            });
          } else if ('identifier' in node) {
            // Try to resolve from state using identifier
            variableIdentifier = node.identifier as string;
            textVarContent = state.getTextVar(variableIdentifier) || '';
            logger.debug(`Trying to resolve TextVar with identifier ${variableIdentifier}`, {
              resolved: textVarContent || 'NOT RESOLVED'
            });
          } else {
            // Use the helper method to extract content safely
            textVarContent = this.getTextContentFromNode(node);
          }
          
          // Check if the TextVar has field access (obj.property) 
          // If it does, we need to process field access explicitly
          if ('fields' in node && Array.isArray(node.fields) && node.fields.length > 0 && variableIdentifier) {
            try {
              const dataValue = state.getDataVar(variableIdentifier);
              if (dataValue !== undefined) {
                // Build the field path
                const fieldPath = node.fields
                  .map(field => {
                    if (field.type === 'index') {
                      return String(field.value);
                    } else if (field.type === 'field') {
                      return String(field.value);
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join('.');
                
                // Create a resolution context for field access
          const resolutionContext: ResolutionContext = ResolutionContextFactory.create(
            undefined, // current file path not needed for this operation
            state
          );
          
          // Use our field accessor to get the specific field value
          const fieldValue = await this.fieldAccessHandler.accessField(dataValue, fieldPath, resolutionContext, {
            strict: false,
            defaultValue: '',
            variableName: fieldPath,
            preserveType: false
          });
                
                logger.debug('Resolved field access in TextVar node', {
                  variableIdentifier,
                  fieldPath,
                  resolvedValue: fieldValue
                });
                
                // Convert to string with appropriate context
                formattingContext.contextType = typeof fieldValue === 'string' && fieldValue.includes('\n') 
                  ? 'block' 
                  : 'inline';
                
                textVarContent = this.convertToString(fieldValue, {
                  context: formattingContext.contextType,
                  pretty: formattingContext.contextType === 'block'
                });
              }
            } catch (fieldAccessError) {
              logger.error('Error accessing fields in TextVar node', {
                variableIdentifier,
                fields: node.fields,
                error: fieldAccessError instanceof Error ? fieldAccessError.message : String(fieldAccessError)
              });
            }
          }
          
          // Process template variables in the content if it's a string
          if (typeof textVarContent === 'string' && textVarContent.includes('{{')) {
            try {
              // Create appropriate resolution context
              const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
                undefined, // current file path not needed here
                state // state service to use
              );
              
              // Try client first if available
              if (this.resolutionClient) {
                try {
                  textVarContent = await this.resolutionClient.resolveText(textVarContent, context);
                  logger.debug('Processed template variables using ResolutionClient', {
                    finalContent: textVarContent
                  });
                } catch (clientError) {
                  logger.warn('Error using resolution client for TextVar, falling back', {
                    error: clientError instanceof Error ? clientError.message : String(clientError)
                  });
                }
              }
              
              // Try service if client failed or not available
              if (textVarContent.includes('{{') && this.resolutionService) {
                try {
                  textVarContent = await this.resolutionService.resolveText(textVarContent, context);
                  logger.debug('Processed template variables using ResolutionService', {
                    finalContent: textVarContent
                  });
                } catch (serviceError) {
                  logger.warn('Error using resolution service for TextVar, will not process nested variables', {
                    error: serviceError instanceof Error ? serviceError.message : String(serviceError)
                  });
                }
              }
            } catch (resolutionError) {
              logger.error('All variable resolution methods failed in TextVar', {
                content: textVarContent,
                error: resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
              });
            }
          }
          
          logger.debug('TextVar resolved content', {
            content: textVarContent,
            type: typeof textVarContent
          });
          
          // Determine if this is block or inline context based on content
          if (typeof textVarContent === 'string') {
            formattingContext.contextType = textVarContent.includes('\n') ? 'block' : 'inline';
          }
          
          // Apply proper newline handling
          return this.handleNewlines(String(textVarContent), formattingContext);
        } catch (e) {
          logger.error('Error processing TextVar node', {
            node: JSON.stringify(node),
            error: e
          });
          throw e;
        }
      case 'DataVar':
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
          if (variableIdentifier && hasFields) {
            // Get the base variable value
            const dataValue = state.getDataVar(variableIdentifier);
            
            if (dataValue !== undefined) {
              // Build the field path from the fields array
              const fieldPath = node.fields
                .map(field => {
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
                // Create a resolution context for field access
                const resolutionContext: ResolutionContext = ResolutionContextFactory.create(
                  undefined, // current file path not needed for this operation
                  state
                );

                // Extract the specific field value using our handler (with await!)
                const fieldValue = await this.fieldAccessHandler.accessField(dataValue, fieldPath, resolutionContext, {
                  strict: false,
                  defaultValue: undefined,
                  variableName: variableIdentifier,
                  preserveType: false
                });
                
                // Determine context based on value type
                if (typeof fieldValue === 'string') {
                  formattingContext.contextType = fieldValue.includes('\n') ? 'block' : 'inline';
                } else if (Array.isArray(fieldValue) && fieldValue.length > 3) {
                  formattingContext.contextType = 'block';
                } else if (typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue).length > 3) {
                  formattingContext.contextType = 'block';
                } else {
                  formattingContext.contextType = 'inline';
                }
                
                // Convert to string with appropriate formatting
                const result = this.convertToString(fieldValue, {
                  pretty: formattingContext.contextType === 'block',
                  preserveType: false,
                  context: formattingContext.contextType
                });
                
                logger.debug('Successfully resolved field access in DataVar', {
                  variableIdentifier,
                  fieldPath,
                  resultLength: result.length,
                  contextType: formattingContext.contextType
                });
                
                // Apply proper newline handling
                return this.handleNewlines(result, formattingContext);
              } catch (fieldAccessError) {
                logger.warn('Error accessing field in DataVar, will try resolution service', {
                  variableIdentifier,
                  fieldPath,
                  error: fieldAccessError instanceof Error ? fieldAccessError.message : String(fieldAccessError)
                });
                // Continue to try other resolution methods
              }
            }
          }
          
          // Try resolution service as a fallback for field access
          if (variableIdentifier && hasFields && (this.resolutionService || this.resolutionClient)) {
            try {
              // Create a resolution context
              const context: ResolutionContext = ResolutionContextFactory.forDataDirective(
                undefined, // current file path not needed here
                state // state service to use
              );
              
              // Build the complete reference with all fields using dot notation
              const fields = node.fields.map(field => {
                if (field.type === 'index') {
                  return String(field.value);
                } else if (field.type === 'field') {
                  return field.value;
                }
                return '';
              }).filter(Boolean);
              
              // Create a variable reference with all fields using dot notation
              const serializedNode = `{{${variableIdentifier}${fields.length > 0 ? '.' + fields.join('.') : ''}}}`;
              
              logger.debug('Resolving DataVar with serialized reference', {
                serializedNode,
                variableIdentifier,
                fields
              });
              
              // Try to resolve with client first
              if (this.resolutionClient) {
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
                undefined, // current file path not needed here
                state // state service to use
              );
              
              // Try client first if available
              if (this.resolutionClient) {
                try {
                  dataVarContent = await this.resolutionClient.resolveText(dataVarContent, context);
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
                  dataVarContent = await this.resolutionService.resolveText(dataVarContent, context);
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
            return '[run directive output placeholder]\n\n';
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
                .map(field => {
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
                .map(field => {
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
                let current = value;
                
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
                        current = undefined;
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
                      current = undefined;
                      break;
                    }
                  } else {
                    // Cannot access field on non-object
                    fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', 
                      'Cannot access field on non-object: ' + field + ' value type: ' + typeof current + '\n'
                    );
                    current = undefined;
                    break;
                  }
                }
                
                if (current !== undefined) {
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
            const embedId = node.id || (node as any).directiveId;
            if (embedId) {
              // Find the node with matching ID in transformed nodes
              const idMatch = transformedNodes.find(n => n.id === embedId || (n as any).directiveId === embedId);
              
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

  private directiveToMarkdown(node: DirectiveNode): string {
    const kind = node.directive.kind;
    if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
      return '';
    }
    if (kind === 'run') {
      return '[run directive output placeholder]\n\n';
    }
    // For other execution directives, return empty string for now
    return '';
  }

  private directiveToXML(node: DirectiveNode): string {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.directiveToMarkdown(node);
  }
}