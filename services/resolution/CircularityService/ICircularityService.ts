/**
 * Service responsible for detecting and preventing circular imports and references.
 * Maintains stacks and dependency graphs to track relationships between files and variables.
 * 
 * @remarks
 * The CircularityService is a critical security service that prevents infinite loops
 * in import chains and variable references. It maintains an import stack to track the
 * current import hierarchy and enforces constraints to prevent circular dependencies.
 * 
 * This service is used by DirectiveService during import operations and by ResolutionService
 * during variable resolution to ensure safe and deterministic processing.
 * 
 * Dependencies:
 * - None directly, though it interacts closely with import and resolution operations
 */
export interface ICircularityService {
  /**
   * Called at the start of an import operation to track the import chain.
   * 
   * @param filePath - The path of the file being imported
   * @throws {MeldImportError} If a circular import is detected
   * 
   * @example
   * ```ts
   * try {
   *   circularityService.beginImport('/path/to/imported.meld');
   *   // Process the import...
   * } finally {
   *   circularityService.endImport('/path/to/imported.meld');
   * }
   * ```
   */
  beginImport(filePath: string): void;

  /**
   * Called after import is finished (success or failure) to clean up the import stack.
   * Removes filePath from the import stack to allow future imports of the same file.
   * 
   * @param filePath - The path of the file that was imported
   */
  endImport(filePath: string): void;

  /**
   * Check if a file is currently in the import stack.
   * Useful for detecting potential circular imports before attempting them.
   * 
   * @param filePath - The path of the file to check
   * @returns true if the file is currently in the import stack, false otherwise
   */
  isInStack(filePath: string): boolean;

  /**
   * Get the current import stack for debugging or error reporting.
   * 
   * @returns An array of file paths representing the current import hierarchy
   * 
   * @example
   * ```ts
   * // In an error handler:
   * const importStack = circularityService.getImportStack();
   * console.error(`Import stack: ${importStack.join(' -> ')}`);
   * ```
   */
  getImportStack(): string[];

  /**
   * Clear the import stack, typically used in testing or to recover from errors.
   * This should be used with caution in production as it may hide circular imports.
   */
  reset(): void;
} 