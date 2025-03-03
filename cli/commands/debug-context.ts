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
import { initializeContextDebugger, VariableResolutionTracker } from '../../tests/utils/debug/index.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';

// Import concrete classes for direct instantiation
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';

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
    // Try to get services from DI container (for tests)
    let stateService, fileSystemService, parserService, directiveService, interpreterService, resolutionService, pathService;
    
    try {
      // For tests, try to get services from container
      stateService = container.resolve('StateService');
      fileSystemService = container.resolve('FileSystemService');
      parserService = container.resolve('ParserService');
      directiveService = container.resolve('DirectiveService');
      interpreterService = container.resolve('InterpreterService');
      resolutionService = container.resolve('ResolutionService');
      pathService = container.resolve('PathService');
      
      console.log(chalk.blue('Using services from dependency injection container'));
    } catch (error) {
      // For runtime use direct instantiation
      console.log(chalk.blue('Creating services directly...'));
      
      // Create the path operations service (needed for FileSystemService)
      const pathOps = new PathOperationsService();
      
      // Create the node file system implementation
      const nodeFs = new NodeFileSystem(pathOps);
      
      // Create the base services first
      stateService = new StateService();
      fileSystemService = new FileSystemService(pathOps, nodeFs);
      parserService = new ParserService();
      pathService = new PathService();
      
      // Initialize the path service
      pathService.initialize(fileSystemService, pathOps);
      
      // Set up state with proper paths
      const resolvedPath = path.resolve(filePath);
      const projectPath = path.dirname(resolvedPath);
      console.log(chalk.blue('Project path:'), projectPath);
      
      stateService.setPathVar('PROJECTPATH', projectPath);
      stateService.setPathVar('.', projectPath);
      stateService.setCurrentFilePath(filePath);
      
      // Try to get the home directory
      try {
        const homePath = process.env.HOME || process.env.USERPROFILE;
        if (homePath) {
          stateService.setPathVar('HOMEPATH', homePath);
          stateService.setPathVar('~', homePath);
        }
      } catch (error) {
        console.warn(chalk.yellow('Could not set home path variables'));
      }
      
      // Create resolution service
      resolutionService = new ResolutionService(
        stateService,
        fileSystemService,
        parserService,
        pathService
      );
      
      // Create the directive service
      directiveService = new DirectiveService();
      
      // Initialize directive service
      directiveService.initialize(
        undefined, // ValidationService (not needed for this command)
        stateService,
        pathService,
        fileSystemService,
        parserService,
        undefined, // InterpreterService (will set this later)
        undefined, // CircularityService (not needed for this command)
        resolutionService
      );
      
      // Create the interpreter service
      interpreterService = new InterpreterService();
      interpreterService.initialize(directiveService, stateService);
      
      // Register default handlers
      directiveService.registerDefaultHandlers();
    }
    
    // Initialize the context debugger
    let contextDebugger;
    try {
      contextDebugger = initializeContextDebugger();
      if (!contextDebugger) {
        throw new Error('Context debugger returned undefined');
      }
      
      // Make sure the debugger is enabled with tracking options
      contextDebugger.enable({
        trackStates: true,
        trackTimestamps: includeTimestamps,
        trackOperations: true,
        trackVariables: includeVars
      });
      
      console.log(chalk.green('Successfully initialized context debugger'));
    } catch (error) {
      console.error(chalk.red('Failed to initialize context debugger:'), error);
      console.error(chalk.yellow('Make sure you have built the codebase with "npm run build" before running debug commands'));
      return;
    }
    
    // Enable resolution tracking if a variable name is provided
    if (variableName && typeof resolutionService.enableResolutionTracking === 'function') {
      resolutionService.enableResolutionTracking({
        watchVariables: [variableName]
      });
    } else if (variableName) {
      console.warn(chalk.yellow('Resolution tracking is not available - enableResolutionTracking method missing'));
      console.warn(chalk.yellow('Variable propagation visualization may be limited'));
    }
    
    console.log(chalk.blue(`Debugging context boundaries for ${filePath}`));
    console.log(chalk.blue(`Visualization type: ${visualizationType}`));
    
    // Read and process the file
    if (!await fileSystemService.exists(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      return;
    }
    
    const fileContent = await fileSystemService.readFile(filePath);
    
    // Use parse instead of parseWithLocations to match test expectations
    const nodes = await parserService.parse(fileContent);
    
    // Create a root state
    const rootState = stateService.createState();
    rootState.setFilePath(filePath);
    
    // Process the file
    await interpreterService.interpret(nodes, {
      initialState: rootState,
      filePath,
      mergeState: true
    });
    
    // Generate visualization
    let visualization = '';
    const effectiveRootStateId = rootStateId || rootState.getId();
    
    console.log(chalk.blue('Generating visualization...'));
    
    try {
      switch (visualizationType) {
        case 'hierarchy':
          visualization = contextDebugger.visualizeContextHierarchy(
            effectiveRootStateId,
            outputFormat,
            {
              includeVars,
              includeTimestamps,
              includeFilePaths
            }
          );
          break;
          
        case 'variable-propagation':
          if (!variableName) {
            console.error(chalk.red('Variable name is required for variable-propagation visualization'));
            return;
          }
          
          visualization = contextDebugger.visualizeVariablePropagation(
            variableName,
            effectiveRootStateId,
            outputFormat,
            {
              includeTimestamps,
              includeFilePaths
            }
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
            console.error(chalk.red('Variable name is required for timeline visualization'));
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
      
      if (!visualization) {
        throw new Error('Visualization generation returned empty result');
      }
      
      console.log(chalk.green('Visualization generated successfully'));
    } catch (error) {
      console.error(chalk.red('Failed to generate visualization:'), error);
      console.error(chalk.yellow('This may be due to missing state tracking data or unsupported visualization type'));
      
      // Provide helpful debugging information
      console.log(chalk.blue('\nDebug information:'));
      console.log(`Root State ID: ${effectiveRootStateId}`);
      console.log(`Visualization Type: ${visualizationType}`);
      console.log(`Output Format: ${outputFormat}`);
      if (variableName) {
        console.log(`Variable Name: ${variableName}`);
      }
      
      return;
    }
    
    // Output the visualization
    if (outputFile) {
      await fs.writeFile(outputFile, visualization);
      console.log(chalk.green(`Visualization saved to ${outputFile}`));
    } else {
      console.log(visualization);
    }
    
  } catch (error) {
    if (error instanceof MeldResolutionError) {
      console.error(chalk.red(`Resolution error: ${error.message}`));
      if (error.details) {
        console.error(chalk.red(`Details: ${JSON.stringify(error.details, null, 2)}`));
      }
    } else {
      console.error(chalk.red(`Error debugging context boundaries: ${error instanceof Error ? error.message : String(error)}`));
      if (error instanceof Error && error.stack) {
        console.error(chalk.dim(error.stack));
      }
    }
    console.error(chalk.yellow('If this is a module resolution error, make sure you have built the codebase with "npm run build" before running debug commands'));
  }
} 