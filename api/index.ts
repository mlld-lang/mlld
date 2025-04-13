/**
 * Meld API Entry Point
 * 
 * Exports the main Meld class and core services for programmatic usage.
 */
import 'reflect-metadata'; // Required for tsyringe
import { container } from 'tsyringe';
import { MeldError } from '@core/errors/MeldError.js';
// Do NOT import Meld class
import type { ProcessOptions } from '@core/types/index.js'; // Correct path
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js'; // Import IOutputService

// DI Container is configured by importing @core/di-config.js elsewhere

// Export core types/errors
export { MeldError };
export type { ProcessOptions };
// Export other necessary types if needed, e.g.:
export type { Location, Position } from '@core/types/index.js';

// Export the main processing function
export async function processMeld(content: string, options?: Partial<ProcessOptions>): Promise<string> {
  // Resolve necessary services from the container
  const parserService = container.resolve<IParserService>('IParserService');
  const stateService = container.resolve<IStateService>('IStateService');
  const interpreterService = container.resolve<IInterpreterService>('IInterpreterService');
  const outputService = container.resolve<IOutputService>('IOutputService');

  // Configure state based on options if necessary (e.g., file path)
  // Example: if (options?.filePath) { stateService.setCurrentFilePath(options.filePath); }

  const ast = await parserService.parse(content);
  const resultState = await interpreterService.interpret(ast, {
      strict: true, // Default or derive from options
      initialState: stateService, // Use the fresh state resolved from container
      // Pass other relevant interpreter options derived from ProcessOptions
      // filePath: options?.filePath
  });

  const nodesToProcess = resultState.getTransformedNodes();
  const finalOutput = await outputService.convert(nodesToProcess, resultState, options?.format || 'xml');

  return finalOutput;
}

// Optionally export a function to get services if needed for advanced usage
export function getService<T>(token: string | symbol): T {
  return container.resolve<T>(token);
}

// NO export of 'Meld' or 'meld' instance