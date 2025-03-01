import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';

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

export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();
  private state: IStateService | undefined;
  private resolutionService: IResolutionService | undefined;

  public canAccessTransformedNodes(): boolean {
    return true;
  }

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('xml', this.convertToXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  initialize(state: IStateService, resolutionService?: IResolutionService): void {
    this.state = state;
    this.resolutionService = resolutionService;
    logger.debug('OutputService initialized with state service', {
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
      const markdown = await this.convertToMarkdown(nodes, state, options);

      // Use llmxml directly with version 1.3.0+ which handles JSON content properly
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: 0.7,
        includeHlevel: false,
        includeTitle: false,
        tagFormat: 'PascalCase',
        verbose: false,
        warningLevel: 'all'
      });
      
      try {
        return llmxml.toXML(markdown);
      } catch (error) {
        // If conversion fails due to non-string values, try to convert any JSON objects
        // in the markdown to string before passing to llmxml again
        logger.warn('First attempt to convert to XML failed, attempting to preprocess markdown', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Try to find and stringify any JSON objects in the markdown
        const processedMarkdown = markdown.replace(/```json\n([\s\S]*?)```/g, (match, jsonContent) => {
          try {
            // Parse and stringify the JSON to ensure it's valid
            const parsed = JSON.parse(jsonContent);
            return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
          } catch (jsonError) {
            // If parsing fails, return the original content
            return match;
          }
        });
        
        // Try again with processed markdown
        return llmxml.toXML(processedMarkdown);
      }
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert output',
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
          
          return typeof textVarContent === 'string' 
            ? (textVarContent.endsWith('\n') ? textVarContent : textVarContent + '\n') 
            : String(textVarContent) + '\n';
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
          
          return typeof dataVarContent === 'string' 
            ? (dataVarContent.endsWith('\n') ? dataVarContent : dataVarContent + '\n')
            : JSON.stringify(dataVarContent) + '\n';
        } catch (e) {
          logger.error('Error processing DataVar node', {
            node: JSON.stringify(node),
            error: e
          });
          throw e;
        }
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
      case 'Directive':
        const directive = node as DirectiveNode;
        const kind = directive.directive.kind;

        // Definition directives always return empty string
        if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
          return '';
        }

        // Handle run directives
        if (kind === 'run') {
          // In non-transformation mode, return placeholder
          if (!state.isTransformationEnabled()) {
            return '[run directive output placeholder]\n';
          }
          // In transformation mode, return the command output
          const transformedNodes = state.getTransformedNodes();
          if (transformedNodes) {
            const transformed = transformedNodes.find(n => 
              n.location?.start.line === node.location?.start.line
            );
            if (transformed && transformed.type === 'Text') {
              const content = (transformed as TextNode).content;
              return content.endsWith('\n') ? content : content + '\n';
            }
          }
          // If no transformed node found, return placeholder
          return '[run directive output placeholder]\n';
        }

        // Handle other execution directives
        if (['embed'].includes(kind)) {
          return '[directive output placeholder]\n';
        }

        return '';
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'markdown');
    }
  }

  private async nodeToXML(node: MeldNode, state: IStateService): Promise<string> {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.nodeToMarkdown(node, state);
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
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
      return '[run directive output placeholder]\n';
    }
    // For other execution directives, return empty string for now
    return '';
  }

  private directiveToXML(node: DirectiveNode): string {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.directiveToMarkdown(node);
  }
}