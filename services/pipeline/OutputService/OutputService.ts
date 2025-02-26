import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';

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

  public canAccessTransformedNodes(): boolean {
    return true;
  }

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  initialize(state: IStateService): void {
    this.state = state;
    logger.debug('OutputService initialized with state service');
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
        error instanceof Error ? error : undefined
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
        nodeTypes: nodes.map(n => n.type)
      });

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

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
        error instanceof Error ? error : undefined
      );
    }
  }

  private async convertToLLMXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    try {
      // First convert to markdown since LLM XML is based on markdown
      const markdown = await this.convertToMarkdown(nodes, state, options);

      // Convert markdown to LLM XML
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML();
      return llmxml.toXML(markdown);
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to LLM XML',
        'llm',
        error instanceof Error ? error : undefined
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
    // Debug: Log full node structure
    logger.debug('Processing node in nodeToMarkdown', {
      nodeType: node.type,
      nodeStructure: Object.keys(node),
      fullNode: JSON.stringify(node, null, 2),
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
          } else if ('text' in node && node.text) {
            textVarContent = node.text;
          } else if ('value' in node && node.value) {
            textVarContent = node.value;
          } else if ('content' in node && (node as any).content) {
            textVarContent = (node as any).content;
          }
          
          // Process template variables in the content if it's a string
          if (typeof textVarContent === 'string') {
            try {
              // First, handle text variable references (${varName})
              if (textVarContent.includes('${')) {
                const textVarPattern = /\${([^}]+)}/g;
                let match;
                let processedContent = textVarContent;
                
                logger.debug('Processing text variables in template', {
                  originalContent: textVarContent
                });
                
                // Replace all text variable references with their values
                while ((match = textVarPattern.exec(textVarContent)) !== null) {
                  const varName = match[1].trim();
                  const varValue = state.getTextVar(varName);
                  
                  logger.debug(`Resolving text variable ${varName}`, {
                    value: varValue ?? 'undefined'
                  });
                  
                  if (varValue !== undefined) {
                    processedContent = processedContent.replace(`\${${varName}}`, varValue);
                  }
                }
                
                textVarContent = processedContent;
              }
              
              // Then, handle data field references (#{data.field})
              if (textVarContent.includes('#{')) {
                const dataVarPattern = /#{([^}]+)}/g;
                let match;
                let processedContent = textVarContent;
                
                logger.debug('Processing data field references in template', {
                  originalContent: textVarContent
                });
                
                // Replace all data field references with their values
                while ((match = dataVarPattern.exec(textVarContent)) !== null) {
                  const fieldRef = match[1].trim();
                  
                  // Handle field access (e.g., user.name)
                  const parts = fieldRef.split('.');
                  const varName = parts[0];
                  
                  // Get the data variable
                  const dataVar = state.getDataVar(varName);
                  
                  logger.debug(`Resolving data variable ${varName}`, {
                    hasValue: dataVar !== undefined,
                    dataVarValue: dataVar ? JSON.stringify(dataVar) : 'undefined'
                  });
                  
                  if (dataVar !== undefined) {
                    // Access nested fields if they exist
                    let fieldValue = dataVar;
                    let fieldAccessError = false;
                    
                    // Follow the field path
                    if (parts.length > 1) {
                      try {
                        fieldValue = parts.slice(1).reduce((obj: any, field) => {
                          if (obj === undefined || obj === null) {
                            fieldAccessError = true;
                            return undefined;
                          }
                          return obj[field];
                        }, dataVar);
                        
                        logger.debug(`Accessed field '${parts.slice(1).join('.')}' from data var '${varName}'`, {
                          fieldValue: fieldValue !== undefined ? JSON.stringify(fieldValue) : 'undefined'
                        });
                      } catch (e) {
                        fieldAccessError = true;
                        logger.error(`Error accessing field '${parts.slice(1).join('.')}' in data var '${varName}'`, {
                          error: e
                        });
                      }
                    }
                    
                    if (!fieldAccessError && fieldValue !== undefined) {
                      // Convert to string if necessary
                      const stringValue = typeof fieldValue === 'object' 
                        ? (Array.isArray(fieldValue) ? fieldValue.join(',') : JSON.stringify(fieldValue))
                        : String(fieldValue);
                      
                      processedContent = processedContent.replace(`#{${fieldRef}}`, stringValue);
                    }
                  }
                }
                
                textVarContent = processedContent;
              }
              
              logger.debug('Processed all template variables', {
                finalContent: textVarContent
              });
            } catch (templateError) {
              logger.error('Error processing template variables', {
                content: textVarContent,
                error: templateError
              });
            }
          }
          
          logger.debug('TextVar resolved content', {
            content: textVarContent,
            type: typeof textVarContent
          });
          
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
            hasData: 'data' in node,
            dataValue: 'data' in node ? JSON.stringify(node.data) : 'undefined',
            hasValue: 'value' in node,
            valueValue: 'value' in node ? JSON.stringify(node.value) : 'undefined',
            hasContent: 'content' in node,
            contentValue: 'content' in node ? JSON.stringify((node as any).content) : 'undefined',
            nodeStr: JSON.stringify(node, null, 2)
          });
          
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
          if (typeof dataVarContent === 'string') {
            try {
              // First, handle text variable references (${varName})
              if (dataVarContent.includes('${')) {
                const textVarPattern = /\${([^}]+)}/g;
                let match;
                let processedContent = dataVarContent;
                
                logger.debug('Processing text variables in DataVar template', {
                  originalContent: dataVarContent
                });
                
                // Replace all text variable references with their values
                while ((match = textVarPattern.exec(dataVarContent)) !== null) {
                  const varName = match[1].trim();
                  const varValue = state.getTextVar(varName);
                  
                  logger.debug(`Resolving text variable ${varName} in DataVar`, {
                    value: varValue ?? 'undefined'
                  });
                  
                  if (varValue !== undefined) {
                    processedContent = processedContent.replace(`\${${varName}}`, varValue);
                  }
                }
                
                dataVarContent = processedContent;
              }
              
              // Then, handle data field references (#{data.field})
              if (dataVarContent.includes('#{')) {
                const dataVarPattern = /#{([^}]+)}/g;
                let match;
                let processedContent = dataVarContent;
                
                logger.debug('Processing data field references in DataVar template', {
                  originalContent: dataVarContent
                });
                
                // Replace all data field references with their values
                while ((match = dataVarPattern.exec(dataVarContent)) !== null) {
                  const fieldRef = match[1].trim();
                  
                  // Handle field access (e.g., user.name)
                  const parts = fieldRef.split('.');
                  const varName = parts[0];
                  
                  // Get the data variable
                  const dataVar = state.getDataVar(varName);
                  
                  logger.debug(`Resolving data variable ${varName} in DataVar template`, {
                    hasValue: dataVar !== undefined,
                    dataVarValue: dataVar ? JSON.stringify(dataVar) : 'undefined'
                  });
                  
                  if (dataVar !== undefined) {
                    // Access nested fields if they exist
                    let fieldValue = dataVar;
                    let fieldAccessError = false;
                    
                    // Follow the field path
                    if (parts.length > 1) {
                      try {
                        fieldValue = parts.slice(1).reduce((obj: any, field) => {
                          if (obj === undefined || obj === null) {
                            fieldAccessError = true;
                            return undefined;
                          }
                          return obj[field];
                        }, dataVar);
                        
                        logger.debug(`Accessed field '${parts.slice(1).join('.')}' from data var '${varName}' in DataVar template`, {
                          fieldValue: fieldValue !== undefined ? JSON.stringify(fieldValue) : 'undefined'
                        });
                      } catch (e) {
                        fieldAccessError = true;
                        logger.error(`Error accessing field '${parts.slice(1).join('.')}' in data var '${varName}' in DataVar template`, {
                          error: e
                        });
                      }
                    }
                    
                    if (!fieldAccessError && fieldValue !== undefined) {
                      // Convert to string if necessary
                      const stringValue = typeof fieldValue === 'object' 
                        ? (Array.isArray(fieldValue) ? fieldValue.join(',') : JSON.stringify(fieldValue))
                        : String(fieldValue);
                      
                      processedContent = processedContent.replace(`#{${fieldRef}}`, stringValue);
                    }
                  }
                }
                
                dataVarContent = processedContent;
              }
              
              logger.debug('Processed all template variables in DataVar', {
                finalContent: dataVarContent
              });
            } catch (templateError) {
              logger.error('Error processing template variables in DataVar', {
                content: dataVarContent,
                error: templateError
              });
            }
          }
          
          logger.debug('DataVar resolved content', {
            content: dataVarContent ? JSON.stringify(dataVarContent) : 'undefined',
            type: typeof dataVarContent
          });
          
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

  private async nodeToLLM(node: MeldNode, state: IStateService): Promise<string> {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.nodeToMarkdown(node, state);
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
  }

  private codeFenceToLLM(node: CodeFenceNode): string {
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

  private directiveToLLM(node: DirectiveNode): string {
    // Use the same logic as markdown for now since we want consistent behavior
    return this.directiveToMarkdown(node);
  }
}