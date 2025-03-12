/**
 * Minimal interface for what ParserService needs from ResolutionService.
 * This interface is used to break the circular dependency between ParserService and ResolutionService.
 */
export interface IResolutionServiceClient {
  /**
   * Resolve a variable reference in the current state.
   * 
   * @param reference - The variable reference to resolve
   * @param options - Optional resolution options
   * @returns The resolved value
   */
  resolveVariableReference(reference: any, options?: any): Promise<any>;
  
  /**
   * Extract a section from content by heading.
   * 
   * @param content - The content to extract from
   * @param heading - The heading to extract
   * @param options - Optional extraction options
   * @returns The extracted section content
   */
  extractSection(content: string, heading: string, options?: any): string;
}

/**
 * Client interface for ResolutionService functionality needed by VariableReferenceResolver
 * This interface is used to break the circular dependency between ResolutionService and VariableReferenceResolver
 */
export interface IResolutionServiceClient {
  /**
   * Resolves variables within a string value
   * @param value - The string containing variables to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the string with variables resolved
   */
  resolveVariables(value: string, context: any): Promise<string>;
} 