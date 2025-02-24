import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

export type OutputFormat = 'markdown' | 'llm';

export interface OutputOptions {
  /**
   * Whether to include state variables in the output
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Custom format-specific options
   */
  formatOptions?: Record<string, unknown>;
}

export interface IOutputService {
  /**
   * Check if this service can access transformed nodes
   * @returns true if transformed nodes can be accessed
   */
  canAccessTransformedNodes(): boolean;

  /**
   * Convert Meld nodes and state to the specified output format.
   * If state.isTransformationEnabled() is true and state.getTransformedNodes() is available,
   * the transformed nodes will be used instead of the input nodes.
   * 
   * In non-transformation mode:
   * - Definition directives (@text, @data, @path, @import, @define) are omitted
   * - Execution directives (@run, @embed) show placeholders
   * 
   * In transformation mode:
   * - All directives are replaced with their transformed results
   * - Plain text and code fences are preserved as-is
   * 
   * @throws {MeldOutputError} If conversion fails
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported formats
   */
  getSupportedFormats(): string[];
} 