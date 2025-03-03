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
import { VariableResolutionTracker, ResolutionTrackingConfig } from '../../src/debug/index.js';
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

interface DebugResolutionOptions {
  filePath: string;
  variableName?: string;
  watchMode?: boolean;
  outputFormat?: 'json' | 'text';
}

// Define interfaces for the resolution tracker types
interface ResolutionAttempt {
  variableName: string;
  context: string;
  timestamp: number;
  success: boolean;
  value?: any;
  source?: string;
  contextBoundary?: {
    type: 'parent-to-child' | 'child-to-parent';
    sourceId?: string;
    targetId?: string;
  };
}

/**
 * Debug variable resolution in a Meld file
 */
export async function debugResolutionCommand(options: DebugResolutionOptions): Promise<void> {
  const { filePath, variableName, outputFormat = 'text' } = options;
  
  console.log('DEBUG: debug-resolution command started with options', JSON.stringify(options));
  console.log(chalk.blue('Debug resolution command started'));
  console.log(chalk.blue('Options:'), JSON.stringify(options, null, 2));
  
  try {
    // Create service instances directly instead of using DI
    console.log(chalk.blue('Creating services...'));
    
    // Create the path operations service (needed for FileSystemService)
    const pathOps = new PathOperationsService();
    
    // Create the node file system implementation
    const nodeFs = new NodeFileSystem(pathOps);
    
    // Create the base services first
    const stateService = new StateService();
    const fileSystemService = new FileSystemService();
    const parserService = new ParserService();
    const pathService = new PathService();
    
    // Initialize the path service 
    pathService.initialize(fileSystemService, parserService);
    
    // Initialize paths in the state service
    const resolvedPath = path.resolve(filePath);
    const projectPath = path.dirname(resolvedPath);
    console.log(chalk.blue('Project path:'), projectPath);
    
    stateService.setPathVar('PROJECTPATH', projectPath);
    stateService.setPathVar('.', projectPath);
    stateService.setCurrentFilePath(filePath);
    
    // Create services that depend on the base services
    const resolutionService = new ResolutionService(
      stateService,
      fileSystemService,
      parserService,
      pathService
    );
    
    const interpreterService = new InterpreterService(
      parserService,
      resolutionService
    );
    
    // Enable resolution tracking if a variable name is provided
    let tracker: VariableResolutionTracker | undefined;
    
    console.log(chalk.blue('Enabling resolution tracking...'));
    if (typeof resolutionService.enableResolutionTracking === 'function') {
      console.log(chalk.blue('enableResolutionTracking method found'));
      const config: ResolutionTrackingConfig = {
        enabled: true
      };
      
      if (variableName) {
        console.log(chalk.blue(`Watching variable: ${variableName}`));
        config.watchVariables = [variableName];
      }
      
      resolutionService.enableResolutionTracking(config);
      console.log(chalk.blue('Resolution tracking enabled'));
    } else {
      console.warn(chalk.yellow('Resolution tracking is not available - enableResolutionTracking method missing'));
    }
    
    console.log(chalk.blue(`Processing file: ${filePath}`));
    
    // Check if file exists
    if (!await fileSystemService.exists(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      return;
    }
    
    // Read file content
    console.log(chalk.blue('Reading file content...'));
    const fileContent = await fileSystemService.readFile(filePath);
    console.log(chalk.blue('File content length:'), fileContent.length);
    
    // Create a root state
    console.log(chalk.blue('Creating root state...'));
    const rootState = stateService;
    
    // Parse the file
    console.log(chalk.blue('Parsing file...'));
    const nodes = await parserService.parse(fileContent);
    console.log(chalk.blue('Parsed nodes:'), nodes.length);
    
    // Process the file
    console.log(chalk.blue('Interpreting nodes...'));
    await interpreterService.interpret(nodes, {
      initialState: rootState,
      filePath,
      mergeState: true
    });
    console.log(chalk.blue('Interpretation complete'));
    
    // Get resolution attempts
    let attempts: ResolutionAttempt[] = [];
    if (typeof resolutionService.getResolutionTracker === 'function') {
      console.log(chalk.blue('Getting resolution attempts...'));
      attempts = resolutionService.getResolutionTracker()?.getAttempts() as ResolutionAttempt[] || [];
      console.log(chalk.blue('Resolution attempts:'), attempts.length);
    }
    
    // Output results
    if (outputFormat === 'json') {
      console.log(JSON.stringify(attempts, null, 2));
    } else {
      // Group attempts by variable
      console.log(chalk.blue('\nResolution attempts by variable:'));
      
      const attemptsByVariable: Record<string, ResolutionAttempt[]> = {};
      
      for (const attempt of attempts) {
        if (!attemptsByVariable[attempt.variableName]) {
          attemptsByVariable[attempt.variableName] = [];
        }
        attemptsByVariable[attempt.variableName].push(attempt);
      }
      
      // Display attempts by variable
      for (const [variable, variableAttempts] of Object.entries(attemptsByVariable)) {
        console.log(chalk.green(`\nVariable: ${variable}`));
        
        for (const attempt of variableAttempts) {
          const status = attempt.success ? chalk.green('✓') : chalk.red('✗');
          const value = attempt.success ? chalk.cyan(JSON.stringify(attempt.value)) : chalk.red('not found');
          const context = chalk.yellow(attempt.context);
          
          console.log(`  ${status} Context: ${context}`);
          console.log(`     Value: ${value}`);
          
          if (attempt.source) {
            console.log(`     Source: ${chalk.magenta(attempt.source)}`);
          }
          
          if (attempt.contextBoundary) {
            const boundaryType = attempt.contextBoundary.type;
            const source = attempt.contextBoundary.sourceId || 'unknown';
            const target = attempt.contextBoundary.targetId || 'unknown';
            
            console.log(`     Boundary: ${chalk.blue(boundaryType)} from ${source} to ${target}`);
          }
        }
      }
      
      // Summary
      console.log(chalk.blue('\nSummary:'));
      console.log(`Total attempts: ${attempts.length}`);
      console.log(`Successful attempts: ${attempts.filter(a => a.success).length}`);
      console.log(`Failed attempts: ${attempts.filter(a => !a.success).length}`);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    
    if (error instanceof MeldResolutionError) {
      console.error(chalk.red(`Resolution error: ${error.message}`));
      if (error.details) {
        console.error(chalk.red(`Details: ${JSON.stringify(error.details, null, 2)}`));
      }
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      if (error instanceof Error && error.stack) {
        console.error(chalk.dim(error.stack));
      }
    }
    console.error(chalk.yellow('If this is a module resolution error, make sure you have built the codebase with "npm run build" before running debug commands'));
  }
} 