import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';

const DEFAULT_OPTIONS: Required<OutputOptions> = {
  includeState: false,
  preserveFormatting: true,
  formatOptions: {}
};

export class OutputService implements IOutputService {
  private formatters = new Map<string, (
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ) => Promise<string>>();

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

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodes, state, opts);
      
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
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
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
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      let output = '';

      // Add state variables if requested
      if (options.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Process nodes
      for (const node of nodes) {
        output += await this.nodeToMarkdown(node, options);
      }

      // Clean up extra newlines if not preserving formatting
      if (!options.preserveFormatting) {
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
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      let output = '<meld>';

      // Add state variables if requested
      if (options.includeState) {
        output += '\n  <state>';
        output += await this.stateToXML(state);
        output += '\n  </state>';
      }

      // Process nodes
      if (nodes.length > 0) {
        output += '\n  <content>';
        for (const node of nodes) {
          output += await this.nodeToXML(node, options);
        }
        output += '\n  </content>';
      }

      output += '\n</meld>';

      // Clean up extra newlines if not preserving formatting
      if (!options.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
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

  private async nodeToMarkdown(
    node: MeldNode,
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      switch (node.type) {
        case 'Text':
          return node.content;
        case 'CodeFence':
          return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\`\n`;
        case 'Directive':
          // Format directive as a markdown comment
          return `<!-- @${node.directive.kind} ${JSON.stringify(node.directive)} -->\n`;
        default:
          throw new MeldOutputError(`Unknown node type: ${(node as any).type}`, 'markdown');
      }
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert node to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async nodeToXML(
    node: MeldNode,
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      switch (node.type) {
        case 'Text':
          return `\n    <text>${this.escapeXML(node.content)}</text>`;
        case 'CodeFence':
          return `\n    <code language="${this.escapeXML(node.language || '')}">${this.escapeXML(node.content)}</code>`;
        case 'Directive':
          return `\n    <directive kind="${this.escapeXML(node.directive.kind)}">${
            typeof node.directive.value === 'string' 
              ? `<value>${this.escapeXML(node.directive.value)}</value>`
              : Object.entries(node.directive)
                  .map(([key, val]) => `<${key}>${this.escapeXML(String(val))}</${key}>`)
                  .join('')
          }</directive>`;
        default:
          throw new MeldOutputError(`Unknown node type: ${(node as any).type}`, 'llm');
      }
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert node to XML',
        'llm',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async stateToXML(state: IStateService): Promise<string> {
    let output = '';

    // Format text variables
    const textVars = state.getAllTextVars();
    if (textVars.size > 0) {
      output += '\n    <text-vars>';
      for (const [name, value] of textVars) {
        output += `\n      <var name="${this.escapeXML(name)}">${this.escapeXML(value)}</var>`;
      }
      output += '\n    </text-vars>';
    }

    // Format data variables
    const dataVars = state.getAllDataVars();
    if (dataVars.size > 0) {
      output += '\n    <data-vars>';
      for (const [name, value] of dataVars) {
        output += `\n      <var name="${this.escapeXML(name)}">${this.escapeXML(JSON.stringify(value))}</var>`;
      }
      output += '\n    </data-vars>';
    }

    return output;
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
} 