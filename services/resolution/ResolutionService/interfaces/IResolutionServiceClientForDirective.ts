import { MeldNode } from '@core/syntax/types';

/**
 * Client interface for ResolutionService functionality needed by DirectiveService
 * This interface is used to break the circular dependency between ResolutionService and DirectiveService
 */
export interface IResolutionServiceClientForDirective {
  /**
   * Resolves text variables in a string
   * @param text - The text to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the text with variables resolved
   */
  resolveText(text: string, context: any): Promise<string>;
  
  /**
   * Resolves data variables and fields
   * @param ref - The data reference to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved data
   */
  resolveData(ref: string, context: any): Promise<any>;
  
  /**
   * Resolves path variables
   * @param path - The path to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved path
   */
  resolvePath(path: string, context: any): Promise<string>;
  
  /**
   * Resolves content from nodes
   * @param nodes - The nodes to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved content
   */
  resolveContent(nodes: MeldNode[], context: any): Promise<string>;
  
  /**
   * Resolves a value in a specific context
   * @param value - The value to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved value
   */
  resolveInContext(value: string | any, context: any): Promise<string>;
} 