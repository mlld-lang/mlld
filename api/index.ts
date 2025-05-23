/**
 * Meld API Entry Point
 * 
 * Exports the main Meld class and core services for programmatic usage.
 */
import 'reflect-metadata'; // Required for tsyringe
import { container } from 'tsyringe';
import '@core/di-config.ts'; // Ensure DI config runs before resolving services
import { MeldError } from '@core/errors/MeldError';
import type { ProcessOptions } from '@core/types/index';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';

// DI Container is configured by importing @core/di-config.js elsewhere

// Export core types/errors
export { MeldError };
export type { ProcessOptions };
// Export other necessary types if needed, e.g.:
export type { Location, Position } from '@core/types/index';

// Export the main processing function
export async function processMeld(content: string, options?: Partial<ProcessOptions>): Promise<string> {
  // Use the new interpreter
  const { interpret } = await import('../interpreter/index');
  
  // Resolve basic services needed by interpreter
  const fileSystem = options?.fs || new NodeFileSystem();
  const pathService = container.resolve<import('@services/fs/PathService/IPathService').IPathService>('IPathService');
  
  // Call the interpreter
  const result = await interpret(content, {
    basePath: require('process').cwd(),
    format: options?.format === 'xml' ? 'xml' : 'markdown',
    fileSystem: fileSystem as any, // Cast to handle interface differences temporarily
    pathService: pathService,
    strict: true // Always use strict mode for now
  });

  return result;
}

// Optionally export a function to get services if needed for advanced usage
export function getService<T>(token: string | symbol): T {
  // Return from the main container for general service access if required
  return container.resolve<T>(token);
}

// NO export of 'Meld' or 'meld' instance