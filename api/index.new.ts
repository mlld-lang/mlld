/**
 * Meld API Entry Point - New Interpreter Version
 * 
 * Simple API that uses the new interpreter directly
 */
import { MeldError } from '@core/errors/MeldError';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';

// Export core types/errors
export { MeldError };
export type { Location, Position } from '@core/types/index';

/**
 * Process options for the Meld API
 */
export interface ProcessOptions {
  format?: 'markdown' | 'xml';
  strict?: boolean;
  basePath?: string;
  fs?: IFileSystem;
}

/**
 * Process Meld content and return the transformed output
 */
export async function processMeld(content: string, options?: ProcessOptions): Promise<string> {
  // Lazy load the interpreter to avoid circular dependencies
  const { interpret } = await import('../interpreter/index');
  
  // Use provided filesystem or default to NodeFileSystem
  const fileSystem = options?.fs || new NodeFileSystem();
  
  // For now, create a minimal path service inline
  // TODO: Remove dependency on PathService in interpreter
  const pathService = {
    resolve: (p: string) => p,
    join: (...parts: string[]) => parts.join('/'),
    dirname: (p: string) => {
      const lastSlash = p.lastIndexOf('/');
      return lastSlash === -1 ? '.' : p.substring(0, lastSlash);
    }
  };
  
  // Call the interpreter
  const result = await interpret(content, {
    basePath: options?.basePath || process.cwd(),
    format: options?.format || 'markdown',
    fileSystem: fileSystem as any,
    pathService: pathService as any,
    strict: options?.strict ?? true
  });

  return result;
}

// Re-export the interpreter for advanced usage
export { interpret } from '../interpreter/index';
export type { InterpretOptions } from '../interpreter/index';