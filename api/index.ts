/**
 * Meld API Entry Point
 * 
 * Exports the main Meld class and core services for programmatic usage.
 */
import 'reflect-metadata'; // Required for tsyringe
import { container, DependencyContainer } from 'tsyringe'; // Import DependencyContainer
import '@core/di-config.ts'; // Ensure DI config runs before resolving services
import { MeldError } from '@core/errors/MeldError';
// Do NOT import Meld class
import type { ProcessOptions } from '@core/types/index'; // Correct path
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem'; // Import IFileSystem
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService'; // Import IOutputService
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
// +++ Import the concrete class +++
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
// +++ Import logger and ILogger +++
import logger, { ILogger } from '@core/utils/logger';
// +++ Import NodeFileSystem +++
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import type { MeldNode, TextNode } from '@core/syntax/types/index'; // <<< Add TextNode import

// DI Container is configured by importing @core/di-config.js elsewhere

// Export core types/errors
export { MeldError };
export type { ProcessOptions };
// Export other necessary types if needed, e.g.:
export type { Location, Position } from '@core/types/index';
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
    } else {
      // <<< Register default NodeFileSystem if none provided >>>
      if (!executionContainer.isRegistered('IFileSystem')) {
        executionContainer.registerInstance<IFileSystem>('IFileSystem', new NodeFileSystem());
      }
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

  // <<< Log ID of received resultState >>>
  // process.stdout.write(`>>> [processMeld ENTRY] Received state ID: ${resultState?.getStateId()}\n`);

  // <<< Restore original getTransformedNodes call >>>
  const nodesToProcess = resultState.getTransformedNodes(); 
  // <<< Keep simple logging >>>
  // process.stdout.write(`\n>>> [processMeld DEBUG] Nodes PRE-OutputService (FROM resultState) (Count: ${nodesToProcess?.length ?? 0}) <<\n`);
  if (nodesToProcess && nodesToProcess.length > 0) {
    // process.stdout.write(`    First 3 nodes: ${JSON.stringify(nodesToProcess.slice(0, 3).map(n => ({ type: n.type, nodeId: n.nodeId, content: (n as any).content?.substring(0, 50) })), null, 2)}\n`);
  } else {
    // process.stdout.write(`    Node list is empty or null.\n`);
  }
  // process.stdout.write(`>>> [processMeld DEBUG] End Nodes PRE-OutputService <<\n\n`);

  // <<< Pass resultState directly to convert >>>
  const finalOutput = await outputService.convert(nodesToProcess, resultState, options?.format || 'xml'); 

  // <<< Dispose container ONLY if it was created internally >>>
  if (!isExternalContainer) { 
    executionContainer.dispose(); 
  }

  // <<< Log the actual value being returned >>>
  // process.stdout.write(`>>> processMeld returning: ${JSON.stringify(finalOutput)}\n`);

  return finalOutput;
}

// Optionally export a function to get services if needed for advanced usage
export function getService<T>(token: string | symbol): T {
  // Return from the main container for general service access if required
  return container.resolve<T>(token);
}

// NO export of 'Meld' or 'meld' instance