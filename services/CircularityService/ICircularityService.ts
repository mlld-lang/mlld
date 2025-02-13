/**
 * Service for tracking and detecting circular imports in Meld files.
 */
export interface ICircularityService {
  /**
   * Called at the start of an import operation.
   * @throws {MeldImportError} If a circular import is detected
   */
  beginImport(filePath: string): void;

  /**
   * Called after import is finished (success or failure).
   * Removes filePath from the import stack.
   */
  endImport(filePath: string): void;

  /**
   * Check if a file is currently in the import stack.
   */
  isInStack(filePath: string): boolean;

  /**
   * Get the current import stack.
   */
  getImportStack(): string[];

  /**
   * Clear the import stack.
   */
  reset(): void;
} 