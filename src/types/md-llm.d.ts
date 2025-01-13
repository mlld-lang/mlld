declare module 'md-llm' {
  export interface MdLlmOptions {
    /**
     * Whether to include metadata in the output
     */
    includeMetadata?: boolean;
    /**
     * Optional section to process
     */
    section?: string;
  }

  /**
   * Converts markdown content to LLM-friendly format
   * @param content The markdown content to convert
   * @param options Optional configuration options
   * @returns Promise that resolves to the converted content
   */
  export function mdToLlm(content: string, options?: MdLlmOptions): Promise<string>;

  /**
   * Converts markdown content to standard markdown format
   * @param content The markdown content to convert
   * @param options Optional configuration options
   * @returns Promise that resolves to the converted content
   */
  export function mdToMarkdown(content: string, options?: MdLlmOptions): Promise<string>;
} 