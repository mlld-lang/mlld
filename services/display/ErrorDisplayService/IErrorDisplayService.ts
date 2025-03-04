/**
 * IErrorDisplayService.ts
 * 
 * Interface for error display service to show errors with source context.
 */

import { MeldError } from '@core/errors/MeldError.js';

export interface IErrorDisplayService {
  /**
   * Format a basic error message without source context
   */
  formatError(error: MeldError): string;
  
  /**
   * Display an error with source code context, highlighting, and formatting
   */
  displayErrorWithSourceContext(error: MeldError): Promise<string>;
  
  /**
   * Enhance and display an error with source mapping information if available
   */
  enhanceErrorDisplay(error: unknown): Promise<string>;
}