import { ResolutionContext, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Interface for ResolutionService functionality needed by clients.
 * This interface is used to break circular dependencies with ResolutionService.
 */
export interface IResolutionServiceClient {
  /**
   * Resolve a variable reference in the current state.
   * 
   * @param reference - The variable reference to resolve
   * @param context - Resolution context with state and allowed variable types
   * @returns The resolved value
   */
  resolveVariableReference(reference: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Extract a section from content by heading.
   * 
   * @param content - The content to extract from
   * @param heading - The heading to extract
   * @param fuzzyThreshold - Optional fuzzy matching threshold (0-1, where 1 is exact match)
   * @returns The extracted section content
   */
  extractSection(content: string, heading: string, fuzzyThreshold?: number): Promise<string>;

  /**
   * Resolves variables within a string value
   * @param value - The string containing variables to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns A promise that resolves to the string with variables resolved
   */
  resolveVariables(value: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Resolves a reference within a specific context
   * @param reference - The reference to resolve (string or structured path)
   * @param context - The resolution context with state and allowed variable types
   * @returns A promise that resolves to the resolved reference
   */
  resolveInContext(reference: string | StructuredPath, context: ResolutionContext): Promise<string>;

  /**
   * Resolves text content, handling any variables or references within it
   * @param text - The text to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns A promise that resolves to the resolved text
   */
  resolveText(text: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Resolve content from a file path.
   * 
   * @param path - The path to the file to read
   * @returns The file content as a string
   * @throws {MeldFileSystemError} If the file cannot be read
   */
  resolveFile(path: string): Promise<string>;
} 