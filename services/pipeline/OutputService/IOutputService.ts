import type { MeldNode } from '@core/syntax/types/index';
import type { IStateService } from '@services/state/StateService/IStateService';

/**
 * Supported output formats for Meld document conversion.
 * - 'markdown': Standard Markdown output
 * - 'xml': LLM-friendly XML format
 */
type OutputFormat = 'markdown' | 'xml';

/**
 * Configuration options for output generation.
 */
interface OutputOptions {
  /**
   * Whether to include state variables in the output.
   * When true, variable definitions are included as comments or metadata.
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines).
   * @default true
   * @deprecated This option is maintained for backward compatibility but has no effect.
   * Formatting is always preserved exactly as in the source document.
   * For formatted output, use the `pretty` option instead.
   */
  preserveFormatting?: boolean;

  /**
   * Whether to apply Prettier formatting to the output.
   * When true, the output is formatted according to Prettier rules.
   * @default false
   */
  pretty?: boolean;

  /**
   * Custom format-specific options.
   * Additional options passed to specific format converters.
   */
  formatOptions?: Record<string, unknown>;
}

/**
 * Service responsible for converting Meld AST nodes into different output formats.
 * Handles transformation of Meld content for final output.
 * 
 * @remarks
 * The OutputService is the final stage in the Meld processing pipeline. It takes
 * the processed AST nodes and state, and converts them into a specific output format
 * like Markdown or XML.
 * 
 * In transformation mode (the only mode):
 * - Directives are replaced with their transformed results
 * - Original document formatting is preserved exactly
 * - Optional Prettier formatting can be applied with the `pretty` option
 * 
 * This service supports pluggable format converters and configuration options to
 * control the output generation process.
 * 
 * Dependencies:
 * - IStateService: For accessing state and transformed nodes
 */
interface IOutputService {
  /**
   * Check if this service can access transformed nodes.
   * Used to determine if transformation mode is available.
   * 
   * @returns true if transformed nodes can be accessed, false otherwise
   */
  canAccessTransformedNodes(): boolean;

  /**
   * Convert Meld nodes and state to the specified output format.
   * 
   * @param nodes - The AST nodes to convert
   * @param state - The state containing variables and transformed nodes
   * @param format - The desired output format
   * @param options - Optional configuration for the conversion
   * @returns A promise that resolves to the formatted output string
   * @throws {MeldOutputError} If conversion fails
   * 
   * @remarks
   * Transformed nodes from state.getTransformedNodes() are always used for output.
   * 
   * Transformation behavior:
   * - All directives are replaced with their transformed results
   * - Plain text and code fences are preserved exactly as-is
   * - Whitespace and newlines are maintained from the source document
   * - Optional Prettier formatting can be applied with the `pretty` option
   * 
   * @example
   * ```ts
   * // Standard output (preserves exact formatting)
   * const output = await outputService.convert(
   *   nodes,
   *   state,
   *   'markdown',
   *   { includeState: false }
   * );
   * 
   * // Output with Prettier formatting
   * const prettyOutput = await outputService.convert(
   *   nodes,
   *   state,
   *   'markdown',
   *   { includeState: false, pretty: true }
   * );
   * ```
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter.
   * Allows extending the service with additional output formats.
   * 
   * @param format - The name of the format to register
   * @param converter - The converter function that generates the output
   * 
   * @example
   * ```ts
   * outputService.registerFormat('html', async (nodes, state, options) => {
   *   // Convert nodes to HTML
   *   let html = '<html><body>';
   *   for (const node of nodes) {
   *     // Process node...
   *   }
   *   html += '</body></html>';
   *   return html;
   * });
   * ```
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported by the service.
   * 
   * @param format - The format name to check
   * @returns true if the format is supported, false otherwise
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported output formats.
   * 
   * @returns An array of supported format names
   * 
   * @example
   * ```ts
   * const formats = outputService.getSupportedFormats();
   * console.log(`Supported formats: ${formats.join(', ')}`);
   * ```
   */
  getSupportedFormats(): string[];
} 

export type { OutputFormat, OutputOptions, IOutputService }; 