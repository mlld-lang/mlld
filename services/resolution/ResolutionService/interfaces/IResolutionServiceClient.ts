/**
 * Interface for ResolutionService functionality needed by clients.
 * This interface is used to break circular dependencies with ResolutionService.
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
  extractSection(content: string, heading: string, options?: any): Promise<string>;

  /**
   * Resolves variables within a string value
   * @param value - The string containing variables to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the string with variables resolved
   */
  resolveVariables(value: string, context: any): Promise<string>;
  
  /**
   * Resolves a reference within a specific context
   * @param reference - The reference to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved reference
   */
  resolveInContext?(reference: string, context: any): Promise<string>;

  /**
   * Resolves text content, handling any variables or references within it
   * @param text - The text to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved text
   */
  resolveText(text: string, context: any): Promise<string>;
} 