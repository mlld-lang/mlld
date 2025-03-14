/**
 * Helper for managing test compatibility during DI migration
 * 
 * This module provides utility functions for adding backward compatibility
 * to services during the transition from dual-mode DI to DI-only mode.
 */

import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { CLIService } from '@services/cli/CLIService/CLIService.js';
import { vi } from 'vitest';

/**
 * Helper class for managing test compatibility during DI migration
 */
export class TestCompatibilityHelper {
  /**
   * Adds backward compatibility methods to a FileSystemService instance
   * 
   * @param fileSystemService - The FileSystemService instance
   * @param fsAdapter - Optional filesystem adapter to augment
   * @returns The augmented filesystem adapter
   */
  static addFileSystemCompatibility(
    fileSystemService: IFileSystemService,
    fsAdapter?: any
  ): any {
    // Create adapter if none provided
    const adapter = fsAdapter || new MemfsTestFileSystemAdapter(fileSystemService);
    
    // Add mkdir method if not present (maps to ensureDir)
    if (typeof adapter.mkdir !== 'function') {
      adapter.mkdir = async (path: string, options?: { recursive?: boolean }) => {
        return fileSystemService.ensureDir(path);
      };
    }
    
    // Add exists method if not present
    if (typeof adapter.exists !== 'function') {
      adapter.exists = async (path: string) => {
        return fileSystemService.exists(path);
      };
    }
    
    // Add writeFile method if not present
    if (typeof adapter.writeFile !== 'function') {
      adapter.writeFile = async (path: string, content: string) => {
        return fileSystemService.writeFile(path, content);
      };
    }
    
    // Add readFile method if not present
    if (typeof adapter.readFile !== 'function') {
      adapter.readFile = async (path: string, encoding?: string) => {
        return fileSystemService.readFile(path, encoding as any);
      };
    }
    
    return adapter;
  }
  
  /**
   * Adds backward compatibility methods to a PathService instance
   * 
   * @param pathService - The PathService instance
   * @returns The pathService with backward compatibility methods
   */
  static addPathServiceCompatibility(
    pathService: IPathService
  ): IPathService {
    // Ensure enableTestMode is available
    if (typeof pathService.enableTestMode !== 'function') {
      (pathService as any).enableTestMode = () => {
        // Empty implementation if not present
        console.warn('PathService.enableTestMode was called but not implemented');
      };
    }
    
    return pathService;
  }
  
  /**
   * Ensures a cleanup function is always valid
   * 
   * @param cleanup - Optional cleanup function to wrap
   * @param context - Optional TestContextDI instance to clean up
   * @returns A safe cleanup function
   */
  static wrapCleanup(cleanup?: Function, context?: TestContextDI): () => void {
    return () => {
      try {
        // Call the original cleanup if provided
        if (cleanup && typeof cleanup === 'function') {
          cleanup();
        }
        
        // Clean up the context if provided
        if (context) {
          context.cleanup().catch(err => {
            console.error('Error during context cleanup:', err);
          });
        }
        
        // Additional cleanup for Vitest
        vi.clearAllMocks();
      } catch (err) {
        console.error('Error in cleanup function:', err);
      }
    };
  }
  
  /**
   * Sets up a compatible CLI test environment
   * 
   * @param context - TestContextDI instance
   * @returns Object containing compatible services
   */
  static setupCompatibleCliServices(context: TestContextDI): { 
    fileSystemService: IFileSystemService, 
    pathService: IPathService, 
    cliService: CLIService
  } {
    const fileSystemService = context.services.filesystem;
    const pathService = context.services.path;
    
    // Add compatibility methods
    this.addPathServiceCompatibility(pathService);
    
    // Get CLI service
    const cliService = context.container.resolve(CLIService);
    
    return {
      fileSystemService,
      pathService,
      cliService
    };
  }
  
  /**
   * Create a proper adapter for using DI services in legacy tests
   * 
   * @param context - TestContextDI instance
   * @returns A compatible adapter
   */
  static createLegacyAdapter(context: TestContextDI): any {
    const fileSystemService = context.services.filesystem;
    const adapter = this.addFileSystemCompatibility(fileSystemService);
    
    return adapter;
  }
  
  /**
   * Try-catch wrapper for legacy tests
   * 
   * @param testFn - The function containing the test
   * @param cleanup - Optional cleanup function
   * @returns A wrapped function that handles errors
   */
  static wrapLegacyTest(testFn: Function, cleanup?: Function): () => Promise<void> {
    return async () => {
      try {
        await testFn();
      } catch (err) {
        console.error('Error in legacy test:', err);
        throw err;
      } finally {
        if (cleanup && typeof cleanup === 'function') {
          cleanup();
        }
      }
    };
  }
} 