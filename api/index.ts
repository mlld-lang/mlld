/**
 * Meld API Entry Point
 * 
 * Exports the main Meld class and core services for programmatic usage.
 */
import 'reflect-metadata'; // Required for tsyringe
import { container, DependencyContainer } from 'tsyringe'; // Import DependencyContainer
import '@core/di-config.js'; // Ensure DI config runs before resolving services
import { MeldError } from '@core/errors/MeldError.js';
// Do NOT import Meld class
import type { ProcessOptions } from '@core/types/index.js'; // Correct path
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js'; // Import IFileSystem
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js'; // Import IOutputService
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
// +++ Import the concrete class +++
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
// +++ Import logger and ILogger +++
import logger, { ILogger } from '@core/utils/logger.js';

// DI Container is configured by importing @core/di-config.js elsewhere

// Export core types/errors
export { MeldError };
export type { ProcessOptions };
// Export other necessary types if needed, e.g.:
export type { Location, Position } from '@core/types/index.js';
export type { IResolutionService };
// +++ Export the concrete class +++
export { ResolutionService };

// Export the main processing function
export async function processMeld(content: string, options?: Partial<ProcessOptions>): Promise<string> {
  // <<< Restore original container logic >>>
  const isExternalContainer = !!options?.container;
  // <<< FIX: Create child container FIRST >>>
  const internalContainer = container.createChildContainer(); 
  // <<< FIX: Register internal container with itself >>>
  internalContainer.registerInstance('DependencyContainer', internalContainer);
  
  const executionContainer = options?.container ?? internalContainer; // Use external if provided, else the configured internal one

  // If a custom filesystem OR logger is needed, register it ONLY if we created the container internally
  if (!isExternalContainer) { 
    if (options?.fs) { // Register FS if provided *and* container is internal
      executionContainer.registerInstance<IFileSystem>('IFileSystem', options.fs);
    }
    // <<< Explicitly register logger in internal container >>>
    if (!executionContainer.isRegistered('MainLogger')) { 
      executionContainer.registerInstance('MainLogger', logger); 
    }
    if (!executionContainer.isRegistered('ILogger')) { 
      executionContainer.register('ILogger', { useToken: 'MainLogger' }); 
    }
  }

  // Resolve services from the determined execution container
  const parserService = executionContainer.resolve<IParserService>('IParserService');
  const stateService = executionContainer.resolve<IStateService>('IStateService'); 
  const interpreterService = executionContainer.resolve<IInterpreterService>('IInterpreterService');
  const outputService = executionContainer.resolve<IOutputService>('IOutputService');

  // <<< Pass the state resolved from the execution container >>>
  const ast = await parserService.parse(content);
  const resultState = await interpreterService.interpret(ast, {
      strict: true, 
      initialState: stateService, 
  });

  const nodesToProcess = resultState.getTransformedNodes(); 
  const finalOutput = await outputService.convert(nodesToProcess, resultState, options?.format || 'xml'); 

  // <<< Dispose container ONLY if it was created internally >>>
  if (!isExternalContainer) { 
    executionContainer.dispose(); 
  }

  return finalOutput;
}

// Optionally export a function to get services if needed for advanced usage
export function getService<T>(token: string | symbol): T {
  // Return from the main container for general service access if required
  return container.resolve<T>(token);
}

// NO export of 'Meld' or 'meld' instance