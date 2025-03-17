import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { importLogger as logger } from '@core/utils/logger.js';
import { Service } from '@core/ServiceProvider.js';
import { injectable } from 'tsyringe';

/**
 * Service for tracking and detecting circular imports in Meld files
 * 
 * This service maintains an import stack to track the current chain of file imports
 * and can detect circular dependencies in the import chain.
 * 
 * @remarks
 * Always use dependency injection to obtain an instance of this service.
 * Manual instantiation without DI is deprecated and will be removed in a future version.
 */
@injectable()
@Service({
  description: 'Service for tracking and detecting circular imports in Meld files'
})
export class CircularityService implements ICircularityService {
  private importStack: string[] = [];

  /**
   * Normalize a path to ensure consistent handling across the application
   * Replaces backslashes with forward slashes for cross-platform compatibility
   * 
   * @param path - The path to normalize
   * @returns The normalized path with consistent slash format
   * @private
   */
  private normalizePath(path: string): string {
    // Normalize path by replacing Windows-style backslashes with forward slashes
    // This ensures consistent path comparisons across platforms
    return path.replace(/\\/g, '/');
  }

  /**
   * Begins tracking an import of the specified file
   * @param filePath - Path of the file being imported
   * @throws {MeldImportError} If a circular import is detected
   */
  beginImport(filePath: string): void {
    const normalizedPath = this.normalizePath(filePath);
    
    logger.debug('Beginning import', { 
      filePath,
      normalizedPath,
      currentStack: this.importStack 
    });

    if (this.isInStack(normalizedPath)) {
      const importChain = [...this.importStack, normalizedPath];
      logger.error('Circular import detected', {
        filePath,
        normalizedPath,
        importChain
      });

      throw new MeldImportError(
        `Circular import detected for file: ${filePath}`,
        {
          code: 'CIRCULAR_IMPORT',
          details: { importChain }
        }
      );
    }

    this.importStack.push(normalizedPath);
  }

  /**
   * Ends tracking of an import for the specified file
   * @param filePath - Path of the file whose import has completed
   */
  endImport(filePath: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const idx = this.importStack.lastIndexOf(normalizedPath);
    
    if (idx !== -1) {
      this.importStack.splice(idx, 1);
      logger.debug('Ended import', { 
        filePath,
        normalizedPath,
        remainingStack: this.importStack 
      });
    } else {
      logger.warn('Attempted to end import for file not in stack', {
        filePath,
        normalizedPath,
        currentStack: this.importStack
      });
    }
  }

  /**
   * Checks if a file is currently in the import stack
   * @param filePath - Path of the file to check
   * @returns True if the file is in the import stack, false otherwise
   */
  isInStack(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    return this.importStack.includes(normalizedPath);
  }

  /**
   * Gets the current import stack
   * @returns Array of file paths in the current import stack
   */
  getImportStack(): string[] {
    return [...this.importStack];
  }

  /**
   * Resets the import stack to an empty state
   */
  reset(): void {
    this.importStack = [];
    logger.debug('Reset import stack');
  }
} 