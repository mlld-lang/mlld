#!/usr/bin/env node

import { container } from 'tsyringe';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { initializeContextDebugger } from '../../tests/utils/debug/StateDebuggerService/index.js';

interface DebugContextOptions {
  filePath: string;
  variableName?: string;
  visualizationType: 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
  rootStateId?: string;
  outputFormat?: 'mermaid' | 'dot' | 'json';
  outputFile?: string;
  includeVars?: boolean;
  includeTimestamps?: boolean;
  includeFilePaths?: boolean;
}

/**
 * Debug context boundaries and variable propagation in Meld
 */
export async function debugContextCommand(options: DebugContextOptions): Promise<void> {
  const { 
    filePath, 
    variableName, 
    visualizationType,
    rootStateId,
    outputFormat = 'mermaid',
    outputFile,
    includeVars = true,
    includeTimestamps = true,
    includeFilePaths = true
  } = options;
  
  try {
    // Get required services
    const resolutionService = container.resolve<IResolutionService>('ResolutionService');
    const stateService = container.resolve<IStateService>('StateService');
    const parserService = container.resolve<IParserService>('ParserService');
    const interpreterService = container.resolve<IInterpreterService>('InterpreterService');
    const fileSystemService = container.resolve<IFileSystemService>('FileSystemService');
    
    // Initialize the context debugger
    const contextDebugger = initializeContextDebugger();
    contextDebugger.enable();
    
    console.log(chalk.blue(`Debugging context boundaries for ${filePath}`));
    
    // Read and process the file
    if (!await fileSystemService.exists(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      return;
    }
    
    const fileContent = await fileSystemService.readFile(filePath);
    const nodes = await parserService.parse(fileContent, filePath);
    
    // Create a root state for the file
    const rootState = stateService.createState();
    rootState.setFilePath(filePath);
    
    // Enable resolution tracking
    (resolutionService as any).enableResolutionTracking({
      watchVariables: variableName ? [variableName] : undefined
    });
    
    // Process the file
    console.log(chalk.blue(`Processing file to track contexts...`));
    const resultState = await interpreterService.interpret(nodes, { state: rootState });
    
    // Get state ID if not provided
    const effectiveRootStateId = rootStateId || rootState.getId();
    
    if (!effectiveRootStateId) {
      console.error(chalk.red(`Could not determine state ID for visualization`));
      return;
    }
    
    console.log(chalk.green(`File processed. Generating visualization...`));
    
    // Generate the appropriate visualization
    let visualization: string;
    
    const config = {
      format: outputFormat,
      includeVars,
      includeTimestamps,
      includeFilePaths,
      includeBoundaryTypes: true,
      highlightBoundaries: true
    };
    
    switch (visualizationType) {
      case 'hierarchy':
        visualization = contextDebugger.visualizeContextHierarchy(
          effectiveRootStateId,
          outputFormat,
          includeVars
        );
        break;
        
      case 'variable-propagation':
        if (!variableName) {
          console.error(chalk.red(`A variable name is required for variable propagation visualization`));
          return;
        }
        
        visualization = contextDebugger.visualizeVariablePropagation(
          variableName,
          effectiveRootStateId,
          outputFormat
        );
        break;
        
      case 'combined':
        visualization = contextDebugger.visualizeContextsAndVariableFlow(
          effectiveRootStateId,
          outputFormat
        );
        break;
        
      case 'timeline':
        if (!variableName) {
          console.error(chalk.red(`A variable name is required for timeline visualization`));
          return;
        }
        
        visualization = contextDebugger.visualizeResolutionTimeline(
          variableName,
          effectiveRootStateId,
          outputFormat
        );
        break;
        
      default:
        console.error(chalk.red(`Unknown visualization type: ${visualizationType}`));
        return;
    }
    
    // Output the visualization
    if (outputFile) {
      await fs.writeFile(outputFile, visualization);
      console.log(chalk.green(`Visualization saved to ${outputFile}`));
    } else {
      console.log(chalk.cyan(`\nVisualization output:\n`));
      console.log(visualization);
    }
    
  } catch (error) {
    console.error(chalk.red(`Error debugging context: ${(error as Error).message}`));
    console.error((error as Error).stack);
  }
} 