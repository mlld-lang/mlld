/**
 * Meld API Entry Point - New Minimal Version
 * 
 * Uses the new minimal services architecture.
 */
import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import '@core/di-config.new.ts'; // Use new DI config
import { MeldError } from '@core/errors/MeldError';
import type { ProcessOptions } from '@core/types/index';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import logger, { ILogger } from '@core/utils/logger';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import type { MeldNode } from '@core/ast/types/index';

// Export core types/errors
export { MeldError };
export type { ProcessOptions };
export type { Location, Position } from '@core/types/index';
export type { IResolutionService };
export { ResolutionService };

// Export the main processing function
export async function processMeld(content: string, options?: Partial<ProcessOptions>): Promise<string> {
  const isExternalContainer = !!options?.container;
  const internalContainer = container.createChildContainer(); 
  internalContainer.registerInstance('DependencyContainer', internalContainer);
  
  const executionContainer = options?.container ?? internalContainer;

  // Register custom services if using internal container
  if (!isExternalContainer) { 
    if (options?.fs) {
      executionContainer.registerInstance<IFileSystem>('IFileSystem', options.fs);
    } else {
      if (!executionContainer.isRegistered('IFileSystem')) {
        executionContainer.registerInstance<IFileSystem>('IFileSystem', new NodeFileSystem());
      }
    }
    if (!executionContainer.isRegistered('MainLogger')) { 
      executionContainer.registerInstance('MainLogger', logger); 
    }
    if (!executionContainer.isRegistered('ILogger')) { 
      executionContainer.register('ILogger', { useToken: 'MainLogger' }); 
    }
  }

  // Resolve services
  const parserService = executionContainer.resolve<IParserService>('IParserService');
  const interpreterService = executionContainer.resolve<IInterpreterService>('IInterpreterService');
  const outputService = executionContainer.resolve<IOutputService>('IOutputService');

  // Process the content
  const ast = await parserService.parse(content, 'input.meld');
  
  // Create initial state if needed
  let initialState: IStateService | undefined;
  if (options?.container) {
    // If external container provided, try to get state from it
    try {
      initialState = executionContainer.resolve<IStateService>('IStateService');
    } catch {
      // If not available, interpreter will create its own
    }
  }
  
  const resultState = await interpreterService.interpret(ast, {
    strict: options?.strict !== false,
    filePath: options?.filePath || 'input.meld'
  }, initialState);

  // Get nodes for output
  const nodesToProcess = resultState.getNodes();
  
  // Convert to final output
  const finalOutput = await outputService.convert(
    nodesToProcess, 
    resultState, 
    options?.format || 'xml'
  );

  // Cleanup
  if (!isExternalContainer) { 
    executionContainer.dispose(); 
  }

  return finalOutput;
}

// Get service helper
export function getService<T>(token: string | symbol): T {
  return container.resolve<T>(token);
}