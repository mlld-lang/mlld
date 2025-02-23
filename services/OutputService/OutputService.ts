import type { IStateService } from '@services/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
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

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
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
      options: opts
    });

    // Use transformed nodes if available in state
    const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
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
        resultLength: result.length
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

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Use transformed nodes if available and transformation is enabled
      const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
        ? state.getTransformedNodes()
        : nodes;

      // Process nodes
      for (const node of nodesToProcess) {
        output += await this.nodeToMarkdown(node, state);
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
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      // Use transformed nodes if available and transformation is enabled
      const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
        ? state.getTransformedNodes()
        : nodes;

      let output = '';

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodesToProcess.length > 0) {
          output += '\n\n';
        }
      }

      // Process nodes
      for (const node of nodesToProcess) {
        output += await this.nodeToLLM(node, state);
      }

      // Use llmxml to handle sectioning the markdown content
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML();
      return llmxml.toXML(output);
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
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
      case 'Directive':
        const directive = node as DirectiveNode;
        if (state.isTransformationEnabled()) {
          // In transformation mode, show transformed content for execution directives
          if (['run', 'embed', 'import'].includes(directive.directive.kind)) {
            return '[directive output placeholder]';
          }
          // For definition directives, return empty string
          return '';
        } else {
          // In non-transformation mode, show command for execution directives
          if (['run', 'embed', 'import'].includes(directive.directive.kind)) {
            return directive.directive.command + '\n';
          }
          // For definition directives, return empty string
          return '';
        }
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'markdown');
    }
  }

  private async nodeToLLM(node: MeldNode, state: IStateService): Promise<string> {
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'CodeFence':
        const fence = node as CodeFenceNode;
        return `\`\`\`${fence.language || ''}\n${fence.content}\n\`\`\`\n`;
      case 'Directive':
        const directive = node as DirectiveNode;
        if (state.isTransformationEnabled()) {
          // In transformation mode, show transformed content for execution directives
          if (['run', 'embed', 'import'].includes(directive.directive.kind)) {
            return '[directive output placeholder]';
          }
          // For definition directives, return empty string
          return '';
        } else {
          // In non-transformation mode, show command for execution directives
          if (['run', 'embed', 'import'].includes(directive.directive.kind)) {
            return directive.directive.command + '\n';
          }
          // For definition directives, return empty string
          return '';
        }
      default:
        throw new MeldOutputError(`Unknown node type: ${node.type}`, 'llm');
    }
  }

  private codeFenceToMarkdown(node: CodeFenceNode): string {
    return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
  }

  private codeFenceToLLM(node: CodeFenceNode): string {
    // Implementation of codeFenceToLLM method
    throw new Error('Method not implemented');
  }

  private directiveToMarkdown(node: DirectiveNode): string {
    const kind = node.directive.kind;
    if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
      return '';
    }
    if (kind === 'run') {
      const command = node.directive.command;
      return `${command}\n`;
    }
    // For other execution directives, return empty string for now
    return '';
  }

  private directiveToLLM(node: DirectiveNode): string {
    // Implementation of directiveToLLM method
    throw new Error('Method not implemented');
  }
}