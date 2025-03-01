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

interface DebugResolutionOptions {
  filePath: string;
  variableName?: string;
  watchMode?: boolean;
  outputFormat?: 'json' | 'text';
}

/**
 * Debug variable resolution in a Meld file
 */
export async function debugResolutionCommand(options: DebugResolutionOptions): Promise<void> {
  const { filePath, variableName, outputFormat = 'text' } = options;
  
  try {
    // Get required services
    const resolutionService = container.resolve<IResolutionService>('ResolutionService');
    const stateService = container.resolve<IStateService>('StateService');
    const parserService = container.resolve<IParserService>('ParserService');
    const interpreterService = container.resolve<IInterpreterService>('InterpreterService');
    const fileSystemService = container.resolve<IFileSystemService>('FileSystemService');
    
    // Enable resolution tracking
    (resolutionService as any).enableResolutionTracking({
      watchVariables: variableName ? [variableName] : undefined
    });
    
    console.log(chalk.blue(`Debugging variable resolution for ${filePath}`));
    console.log(chalk.blue(`Variable filter: ${variableName || 'All variables'}`));
    
    // Read and process the file
    if (!await fileSystemService.exists(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      return;
    }
    
    const fileContent = await fileSystemService.readFile(filePath);
    const nodes = await parserService.parse(fileContent, filePath);
    
    // Set up state with proper paths
    const resolvedPath = await fileSystemService.resolvePath(filePath);
    const projectPath = path.dirname(resolvedPath);
    stateService.setPathVar('PROJECTPATH', projectPath);
    stateService.setPathVar('.', projectPath);
    
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
    
    console.log(chalk.blue('Processing file...'));
    
    // Interpret the file
    await interpreterService.interpret(nodes, {
      initialState: stateService,
      filePath,
      mergeState: true
    });
    
    // Get the resolution tracker
    const tracker = (resolutionService as any).getResolutionTracker();
    
    if (!tracker) {
      console.error(chalk.red('Resolution tracking is not available'));
      return;
    }
    
    // Get and display the results
    const attempts = tracker.getAttempts();
    
    if (attempts.length === 0) {
      console.log(chalk.yellow('No variable resolution attempts recorded'));
      return;
    }
    
    console.log(chalk.green(`Captured ${attempts.length} resolution attempts`));
    
    // Filter for the specific variable if provided
    const filteredAttempts = variableName
      ? attempts.filter(a => a.variableName === variableName)
      : attempts;
    
    if (filteredAttempts.length === 0) {
      console.log(chalk.yellow(`No resolution attempts found for variable "${variableName}"`));
      return;
    }
    
    // Output results
    if (outputFormat === 'json') {
      console.log(JSON.stringify(filteredAttempts, null, 2));
    } else {
      // Group attempts by variable
      const attemptsByVariable = new Map<string, typeof filteredAttempts>();
      
      for (const attempt of filteredAttempts) {
        if (!attemptsByVariable.has(attempt.variableName)) {
          attemptsByVariable.set(attempt.variableName, []);
        }
        attemptsByVariable.get(attempt.variableName)!.push(attempt);
      }
      
      // Print a summary for each variable
      for (const [varName, varAttempts] of attemptsByVariable.entries()) {
        const successCount = varAttempts.filter(a => a.success).length;
        const failCount = varAttempts.length - successCount;
        
        console.log(chalk.cyan(`\nVariable: ${varName}`));
        console.log(chalk.cyan(`Total attempts: ${varAttempts.length} (${successCount} success, ${failCount} fail)`));
        
        // Print detailed information
        varAttempts.forEach((attempt, i) => {
          const statusColor = attempt.success ? chalk.green : chalk.red;
          const status = attempt.success ? 'SUCCESS' : 'FAILED';
          const value = attempt.success 
            ? (typeof attempt.value === 'object' 
                ? JSON.stringify(attempt.value, null, 2) 
                : String(attempt.value))
            : 'undefined';
          
          console.log(chalk.dim(`\nAttempt #${i + 1}:`));
          console.log(`Status: ${statusColor(status)}`);
          console.log(`Context: ${attempt.context}`);
          console.log(`Source: ${attempt.source || 'unknown'}`);
          
          if (attempt.contextBoundary) {
            console.log(`Boundary: ${attempt.contextBoundary.type}`);
            if (attempt.contextBoundary.sourceId) {
              console.log(`Source ID: ${attempt.contextBoundary.sourceId}`);
            }
            if (attempt.contextBoundary.targetId) {
              console.log(`Target ID: ${attempt.contextBoundary.targetId}`);
            }
          }
          
          if (attempt.success) {
            console.log(`Value: ${chalk.green(value)}`);
          }
        });
      }
    }
    
  } catch (error) {
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
  }
} 