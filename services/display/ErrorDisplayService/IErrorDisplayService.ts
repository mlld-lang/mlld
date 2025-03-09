/**
 * Service responsible for error display, formatting, and source code context.
 * Provides user-friendly error presentation with code highlighting.
 * 
 * @remarks
 * The ErrorDisplayService enhances error presentation by adding source code context,
 * syntax highlighting, and clear error messaging. It's primarily used by the CLI and
 * other user-facing interfaces to present errors in a comprehensible way.
 * 
 * This service is designed to work with Meld's specialized error types that include
 * location information, enabling precise highlighting of problematic code sections.
 * 
 * Dependencies:
 * - IFileSystemService: For reading source files to display context
 * - Optional syntax highlighting libraries for code formatting
 */

import { MeldError } from '@core/errors/MeldError.js';

export interface IErrorDisplayService {
  /**
   * Format a basic error message without source context.
   * Creates a simple string representation of the error.
   * 
   * @param error - The Meld error to format
   * @returns Formatted error message as a string
   * 
   * @example
   * ```ts
   * const message = errorDisplayService.formatError(new MeldParseError('Unexpected token'));
   * console.error(message);
   * // Output: "Parse Error: Unexpected token at example.meld:10:5"
   * ```
   */
  formatError(error: MeldError): string;
  
  /**
   * Display an error with source code context, highlighting, and formatting.
   * Adds code snippets, line numbers, and highlighting to show exactly where the error occurred.
   * 
   * @param error - The Meld error to display with context
   * @returns A promise that resolves to the formatted error with source context
   * 
   * @example
   * ```ts
   * const display = await errorDisplayService.displayErrorWithSourceContext(parseError);
   * console.log(display);
   * // Output includes error message, source file snippet with highlighted error location
   * ```
   */
  displayErrorWithSourceContext(error: MeldError): Promise<string>;
  
  /**
   * Enhance and display an error with source mapping information if available.
   * Handles both Meld-specific errors and generic JavaScript errors.
   * 
   * @param error - Any error object to enhance and display
   * @returns A promise that resolves to the enhanced error display
   * 
   * @remarks
   * This method attempts to convert generic errors to Meld errors when possible,
   * extracting location information from stack traces or error messages.
   * For Meld errors, it delegates to displayErrorWithSourceContext.
   * 
   * @example
   * ```ts
   * try {
   *   await processFile('example.meld');
   * } catch (error) {
   *   const display = await errorDisplayService.enhanceErrorDisplay(error);
   *   console.error(display);
   * }
   * ```
   */
  enhanceErrorDisplay(error: unknown): Promise<string>;
}