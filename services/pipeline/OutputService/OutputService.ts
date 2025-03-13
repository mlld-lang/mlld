import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { MeldError } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

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
    { token: 'IResolutionService', name: 'resolutionService' }
  ]
})
export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();
  private state: IStateService | undefined;
  private resolutionService: IResolutionService | undefined;

  public canAccessTransformedNodes(): boolean {
    return true;
  }

  /**
   * Creates a new OutputService instance.
   * Uses dependency injection for service dependencies.
   * 
   * @param state State service (injected)
   * @param resolutionService Resolution service for variable resolution (injected)
   */
  constructor(
    @inject('IStateService') state?: IStateService,
    @inject('IResolutionService') resolutionService?: IResolutionService
  ) {
    this.initializeFromParams(state, resolutionService);
  }

  /**
   * Initialize this service with the given parameters.
   * Always uses DI mode initialization.
   */
  private initializeFromParams(
    state?: IStateService,
    resolutionService?: IResolutionService
  ): void {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('xml', this.convertToXML.bind(this));

    // Always initialize in DI mode
    this.state = state;
    this.resolutionService = resolutionService;
    
    logger.debug('OutputService initialized with state service', {
      hasResolutionService: !!resolutionService,
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
          
          // If no matches, return original content
          if (matches.length === 0) {
            // In transformation mode, preserve original newline handling
            return content.endsWith('\n') ? content : content + '\n';
          }
          
          // Only proceed with transformation if we're supposed to transform variables
          if (!state.shouldTransform || state.shouldTransform('variables')) {
            // Process each variable reference
            for (const match of matches) {
              const fullMatch = match[0]; // The entire match, e.g., {{variable}}
              const reference = match[1].trim(); // The variable reference, e.g., variable
  
              try {
                // Split the reference into variable name and field path
                const parts = reference.split('.');
                const variableName = parts[0];
                const fieldPath = parts.length > 1 ? parts.slice(1).join('.') : '';
                
                logger.debug('Processing variable reference:', {
                  fullMatch,
                  variableName,
                  fieldPath
                });
                
                // Try to get the variable value from the state
                let value;
                
                // Try text variable first
                value = state.getTextVar(variableName);
                
                logger.debug('Looking up variable in state', {
                  variableName,
                  value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined',
                  type: 'text'
                });
                
                // If not found as text variable, try data variable
                if (value === undefined) {
                  value = state.getDataVar(variableName);
                  logger.debug('Looking up data variable in state', {
                    variableName,
                    value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined',
                    type: 'data'
                  });
                }
                
                // Process field access for data variables
                if (value !== undefined && fieldPath) {
                  // Handle field access for data variables
                  const fields = fieldPath.split('.');
                  let currentValue: any = value;
                  
                  for (const field of fields) {
                    // Check if field is numeric (array index)
                    const isNumeric = /^\d+$/.test(field);
                    
                    if (isNumeric && Array.isArray(currentValue)) {
                      // Access array by index
                      const index = parseInt(field, 10);
                      if (index < currentValue.length) {
                        currentValue = currentValue[index];
                      } else {
                        // Array index out of bounds
                        currentValue = undefined;
                        break;
                      }
                    } else if (typeof currentValue === 'object' && currentValue !== null) {
                      // Access object property with type safety
                      currentValue = currentValue[field];
                    } else {
                      // Cannot access property of non-object
                      currentValue = undefined;
                      break;
                    }
                    
                    // If we hit undefined, stop traversing
                    if (currentValue === undefined) {
                      break;
                    }
                  }
                  
                  // Update value with resolved field access
                  value = currentValue;
                }
                
                // If a value was found, replace the variable reference with its value
                if (value !== undefined) {
                  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                  // Replace the variable reference directly without adding any line breaks
                  transformedContent = transformedContent.replace(fullMatch, stringValue);
                  
                  logger.debug('Replaced variable reference in Text node', {
                    variableName,
                    fieldPath,
                    value: stringValue,
                    fullMatch,
                    before: content,
                    after: transformedContent
                  });
                } else {
                  logger.warn('Variable not found in state', {
                    variableName,
                    fieldPath,
                    fullMatch
                  });
                  // Leave the variable reference unchanged if value not found
                }
              } catch (error) {
                // Handle errors during variable resolution
                logger.error('Error resolving variable reference:', {
                  fullMatch,
                  reference,
                  error
                });
                // Leave the variable reference unchanged on error
              }
            }
            
            // In transformation mode, preserve original newline handling
            return transformedContent.endsWith('\n') ? transformedContent : transformedContent + '\n';
          }
        }
        
        // Check if the content contains variable references and ResolutionService is available
        if (content.includes('{{') && this.resolutionService) {
          try {
            // Create appropriate resolution context for text variables
            const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
              undefined, // current file path not needed here
              state // state service to use
            );
            
            // Use ResolutionService to resolve variables in text
            const resolvedContent = await this.resolutionService.resolveText(content, context);
            
            logger.debug('Resolved variable references in Text node using ResolutionService', {
              original: content,
              resolved: resolvedContent
            });
            
            // For standard mode (non-transformation), use double newlines for markdown nodes
            // This follows standard markdown practice which uses double newlines between paragraphs
            if (!state.isTransformationEnabled()) {
              return resolvedContent.endsWith('\n\n') ? resolvedContent : 
                     resolvedContent.endsWith('\n') ? resolvedContent + '\n' : 
                     resolvedContent + '\n\n';
            }
            
            // In transformation mode, preserve original newline handling
            return resolvedContent.endsWith('\n') ? resolvedContent : resolvedContent + '\n';
          } catch (resolutionError) {
            logger.error('Error resolving variable references in Text node', {
              content,
              error: resolutionError
            });
            // Fall back to original content if resolution fails
          }
        }
        
        // For standard mode (non-transformation), use double newlines for markdown nodes
        // This follows standard markdown practice which uses double newlines between paragraphs
        if (!state.isTransformationEnabled()) {
          return content.endsWith('\n\n') ? content : 
                 content.endsWith('\n') ? content + '\n' : 
                 content + '\n\n';
        }
        
        // In transformation mode, preserve original newline handling
        return content.endsWith('\n') ? content : content + '\n';
      case 'TextVar':
        // Handle TextVar nodes
        try {
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
          if ('id' in node) {
            // Try to resolve from state using id
            const id = node.id as string;
            textVarContent = state.getTextVar(id) || '';
            logger.debug(`Trying to resolve TextVar with id ${id}`, {
              resolved: textVarContent || 'NOT RESOLVED'
            });
          } else if ('identifier' in node) {
            // Try to resolve from state using identifier
            const identifier = node.identifier as string;
            textVarContent = state.getTextVar(identifier) || '';
            logger.debug(`Trying to resolve TextVar with identifier ${identifier}`, {
              resolved: textVarContent || 'NOT RESOLVED'
            });
          } else {
            // Use the helper method to extract content safely
            textVarContent = this.getTextContentFromNode(node);
          }
          
          // Process template variables in the content if it's a string
          if (typeof textVarContent === 'string' && this.resolutionService) {
            try {
              // Create appropriate resolution context for text variables
              const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
                undefined, // current file path not needed here
                state // state service to use
              );
              
              // Use ResolutionService to resolve variables in text
              textVarContent = await this.resolutionService.resolveText(textVarContent, context);
              
              logger.debug('Processed all template variables using ResolutionService', {
                finalContent: textVarContent
              });
            } catch (resolutionError) {
              logger.error('Error resolving template variables with ResolutionService', {
                content: textVarContent,
                error: resolutionError
              });
            }
          }
          
          logger.debug('TextVar resolved content', {
            content: textVarContent,
            type: typeof textVarContent
          });
          
          // Handle transformation mode - don't add newlines in transformation mode
          if (state.isTransformationEnabled()) {
            return String(textVarContent);
          }
          
          // For standard mode (non-transformation), use double newlines for markdown nodes
          // This follows standard markdown practice which uses double newlines between paragraphs
          const content = String(textVarContent);
          return content.endsWith('\n\n') ? content : 
                 content.endsWith('\n') ? content + '\n' : 
                 content + '\n\n';
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
          
          // For transformation mode, we need to resolve the field access if fields are present
          // This is necessary for things like array access with dot notation (items.0)
          if (state.isTransformationEnabled() && 'fields' in node && Array.isArray(node.fields) && node.fields.length > 0 && this.resolutionService) {
            if ('identifier' in node) {
              const identifier = node.identifier as string;
              
              logger.debug('Attempting to resolve DataVar in transformation mode with fields', {
                identifier,
                fields: node.fields,
                fieldTypes: node.fields.map(f => f.type),
                fieldValues: node.fields.map(f => f.value)
              });
              
              try {
                // Process all fields at once rather than individually
                // Create a resolution context
                const context: ResolutionContext = ResolutionContextFactory.forDataDirective(
                  undefined, // current file path not needed here
                  state // state service to use
                );
                
                // Build the complete reference with all fields using dot notation
                const fields = node.fields.map(field => {
                  if (field.type === 'index') {
                    // For index type, convert to numeric string
                    return String(field.value);
                  } else if (field.type === 'field') {
                    return field.value;
                  }
                  return '';
                }).filter(Boolean);
                
                // Create a variable reference with all fields using dot notation
                // This matches the format expected in the test files
                const serializedNode = `{{${identifier}${fields.length > 0 ? '.' + fields.join('.') : ''}}}`;
                
                logger.debug('Resolving DataVar with all fields at once', {
                  serializedNode,
                  identifier,
                  fields
                });
                
                // Use ResolutionService to resolve the complete variable reference
                const resolved = await this.resolutionService.resolveInContext(serializedNode, context);
                
                logger.debug('DataVar field access resolution result', {
                  serializedNode,
                  resolved
                });
                
                return String(resolved);
              } catch (resolutionError) {
                // Log the error but throw it to prevent falling through to other resolution methods
                logger.error('Error resolving DataVar with field access', {
                  error: resolutionError,
                  errorMessage: resolutionError instanceof Error ? resolutionError.message : String(resolutionError),
                  cause: resolutionError instanceof Error && 'cause' in resolutionError ? resolutionError.cause : undefined
                });
                
                throw resolutionError;
              }
            }
          }
          
          // If not transformation mode or resolution with fields failed, fall back to standard resolution
          // Try various possible property names and resolve from state
          let dataVarContent: any = '';
          if ('id' in node) {
            // Try to resolve from state using id
            const id = node.id as string;
            dataVarContent = state.getDataVar(id);
            logger.debug(`Trying to resolve DataVar with id ${id}`, {
              resolved: dataVarContent ? JSON.stringify(dataVarContent) : 'NOT RESOLVED'
            });
          } else if ('identifier' in node) {
            // Try to resolve from state using identifier
            const identifier = node.identifier as string;
            dataVarContent = state.getDataVar(identifier);
            logger.debug(`Trying to resolve DataVar with identifier ${identifier}`, {
              resolved: dataVarContent ? JSON.stringify(dataVarContent) : 'NOT RESOLVED'
            });
          } else if ('data' in node && node.data) {
            dataVarContent = node.data;
          } else if ('value' in node && node.value) {
            dataVarContent = node.value;
          } else if ('content' in node && (node as any).content) {
            dataVarContent = (node as any).content;
          }
          
          // Process template variables for string values
          if (typeof dataVarContent === 'string' && this.resolutionService) {
            try {
              // Create appropriate resolution context for data variables
              const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
                undefined, // current file path not needed here
                state // state service to use
              );
              
              // Use ResolutionService to resolve variables in text
              dataVarContent = await this.resolutionService.resolveText(dataVarContent, context);
              
              logger.debug('Processed all template variables in DataVar using ResolutionService', {
                finalContent: dataVarContent
              });
            } catch (resolutionError) {
              logger.error('Error resolving template variables in DataVar with ResolutionService', {
                content: dataVarContent,
                error: resolutionError
              });
            }
          }
          
          logger.debug('DataVar resolved content', {
            content: dataVarContent ? JSON.stringify(dataVarContent) : 'undefined',
            type: typeof dataVarContent
          });
          
          // In transformation mode, don't add newlines
          if (state.isTransformationEnabled()) {
            return typeof dataVarContent === 'string' 
              ? dataVarContent
              : JSON.stringify(dataVarContent);
          }
          
          // For standard mode (non-transformation), use double newlines for markdown nodes
          const content = typeof dataVarContent === 'string' 
              ? dataVarContent
              : JSON.stringify(dataVarContent);
          
          return content.endsWith('\n\n') ? content : 
                 content.endsWith('\n') ? content + '\n' : 
                 content + '\n\n';
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
          // In non-transformation mode, return placeholder
          if (!state.isTransformationEnabled()) {
            return '[directive output placeholder]\n\n';
          }
          
          // In transformation mode, return the embedded content
          const transformedNodes = state.getTransformedNodes();
          if (transformedNodes && transformedNodes.length > 0) {
            // First try exact line match (original behavior)
            const exactMatch = transformedNodes.find(n => 
              n.location?.start.line === node.location?.start.line
            );
            
            logger.debug('Looking for transformed embed node', {
              directiveLine: node.location?.start.line,
              transformedNodeCount: transformedNodes.length,
              foundExactMatch: !!exactMatch,
              transformedNodeLines: transformedNodes.map(n => n.location?.start.line)
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
              logger.debug('Found closest transformed node for embed directive', {
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
          logger.warn('No transformed node found for embed directive', {
            directiveLine: node.location?.start.line,
            directivePath: directive.directive.path
          });
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