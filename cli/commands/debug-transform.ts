#!/usr/bin/env node

import { container } from 'tsyringe';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import { MeldResolutionError } from '@core/errors/MeldResolutionError';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { initializeContextDebugger, StateVisualizationService } from '@tests/utils/debug/index';
import type { IPathService } from '@services/fs/PathService/IPathService';

// Import concrete classes for direct instantiation
import { StateService } from '@services/state/StateService/StateService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import { PathService } from '@services/fs/PathService/PathService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';

interface DebugTransformOptions {
  filePath: string;
  directiveType?: string;
  outputFormat?: 'text' | 'json' | 'mermaid';
  outputFile?: string;
  includeContent?: boolean;
}

/**
 * Debug node transformations through the pipeline
 */
export async function debugTransformCommand(options: DebugTransformOptions): Promise<void> {
  const { 
    filePath, 
    directiveType, 
    outputFormat = 'text',
    outputFile,
    includeContent = false
  } = options;
  
  try {
    // Try to get services from DI container (for tests)
    let stateService, fileSystemService, parserService, directiveService, interpreterService;
    
    try {
      // For tests, try to get services from container
      stateService = container.resolve('StateService');
      fileSystemService = container.resolve('FileSystemService');
      parserService = container.resolve('ParserService');
      directiveService = container.resolve('DirectiveService');
      interpreterService = container.resolve('InterpreterService');
      
      console.log(chalk.blue('Using services from dependency injection container'));
    } catch (error) {
      // For runtime use direct instantiation
      console.log(chalk.blue('Creating services directly...'));
      
      // Create the path operations service (needed for FileSystemService)
      const pathOps = new PathOperationsService();
      
      // Create the node file system implementation
      const nodeFs = new NodeFileSystem();
      
      // Create the base services first
      stateService = new StateService();
      fileSystemService = new FileSystemService(pathOps, nodeFs);
      parserService = new ParserService();
      const pathService = new PathService();
      
      // Initialize the path service
      pathService.initialize(fileSystemService, pathOps);
      
      // Create the resolution service
      const resolutionService = new ResolutionService(
        stateService,
        fileSystemService,
        parserService,
        pathService
      );
      
      // Create the validation service
      const validationService = new ValidationService();
      
      // Create the interpreter service first
      interpreterService = new InterpreterService();
      
      // Create the circularity service
      const circularityService = new CircularityService();
      
      // Create the directive service
      directiveService = new DirectiveService();
      directiveService.initialize(
        validationService,
        stateService,
        pathService,
        fileSystemService,
        parserService,
        interpreterService, // InterpreterService
        circularityService, // CircularityService
        resolutionService
      );
      
      // Initialize the interpreter service
      interpreterService.initialize(directiveService, stateService);
      
      // Register default handlers
      directiveService.registerDefaultHandlers();
    }
    
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
    
    // Enable transformation tracking
    if (!interpreterService.canHandleTransformations()) {
      console.error(chalk.red('This interpreter does not support transformations'));
      console.error(chalk.yellow('Make sure you have built the codebase with "npm run build" before running debug commands'));
      return;
    }

    console.log(chalk.blue(`Debugging transformations for ${filePath}`));
    if (directiveType) {
      console.log(chalk.blue(`Focusing on directive type: ${directiveType}`));
    }
    
    // Read and process the file
    if (!await fileSystemService.exists(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      return;
    }
    
    const fileContent = await fileSystemService.readFile(filePath);
    
    // Use parse instead of parseWithLocations to match test expectations
    const nodes = await parserService.parse(fileContent);
    
    // Create a tracking proxy for directiveService
    const transformations: Array<{
      directiveType: string;
      nodeType: string;
      originalNode: any;
      transformedNode: any;
      timestamp: number;
      success: boolean;
      error?: string;
    }> = [];
    
    // Track the transformations by hooking into the processDirective method
    const originalProcessDirective = directiveService.processDirective.bind(directiveService);
    directiveService.processDirective = async (node, context) => {
      const startTime = Date.now();
      let success = true;
      let error: string | undefined;
      let result;
      
      const nodeType = node.type;
      const directiveKind = node.kind || 'unknown';
      
      // Skip if we're filtering by directive type and this doesn't match
      if (directiveType && directiveKind !== directiveType) {
        return originalProcessDirective(node, context);
      }
      
      try {
        result = await originalProcessDirective(node, context);
      } catch (e) {
        success = false;
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        // Record the transformation attempt
        transformations.push({
          directiveType: directiveKind,
          nodeType,
          originalNode: includeContent ? node : { type: nodeType, kind: directiveKind },
          transformedNode: includeContent && result && 'replacement' in result 
            ? result.replacement 
            : { type: 'unknown', replaced: 'replacement' in result },
          timestamp: startTime,
          success,
          error
        });
      }
      
      return result;
    };
    
    console.log(chalk.blue('Processing file to track transformations...'));
    
    // Interpret the file with transformation enabled
    await interpreterService.interpret(nodes, {
      initialState: stateService,
      filePath,
      mergeState: true
    });
    
    console.log(chalk.green(`Processing complete. Captured ${transformations.length} transformations.`));
    
    // Generate output based on format
    let output: string;
    
    if (outputFormat === 'json') {
      output = JSON.stringify(transformations, null, 2);
    } else if (outputFormat === 'mermaid') {
      // Initialize the visualization service for Mermaid output
      try {
        const visualizationService = initializeContextDebugger().getVisualizationService();
        output = visualizationService.transformToMermaid(transformations, {
          includeTimestamps: true,
          includeDirectiveTypes: true
        });
      } catch (error) {
        console.warn(chalk.yellow('Could not initialize visualization service. Using fallback mermaid generator.'));
        output = generateMermaidDiagram(transformations);
      }
    } else {
      // Default text format
      output = generateTextReport(transformations);
    }
    
    // Output the results
    if (outputFile) {
      await fs.writeFile(outputFile, output);
      console.log(chalk.green(`Transformation results saved to ${outputFile}`));
    } else {
      console.log(chalk.cyan('\nTransformation Report:\n'));
      console.log(output);
    }
    
  } catch (error) {
    if (error instanceof MeldResolutionError) {
      console.error(chalk.red(`Resolution error: ${error.message}`));
      if (error.details) {
        console.error(chalk.red(`Details: ${JSON.stringify(error.details, null, 2)}`));
      }
    } else {
      console.error(chalk.red(`Error debugging transformations: ${error instanceof Error ? error.message : String(error)}`));
      if (error instanceof Error && error.stack) {
        console.error(chalk.dim(error.stack));
      }
    }
    console.error(chalk.yellow('If this is a module resolution error, make sure you have built the codebase with "npm run build" before running debug commands'));
  }
}

/**
 * Generate a text report of the transformations
 */
function generateTextReport(transformations: Array<any>): string {
  if (transformations.length === 0) {
    return 'No transformations captured.';
  }
  
  // Group by directive type
  const byDirectiveType = new Map<string, typeof transformations>();
  
  for (const transform of transformations) {
    if (!byDirectiveType.has(transform.directiveType)) {
      byDirectiveType.set(transform.directiveType, []);
    }
    byDirectiveType.get(transform.directiveType)!.push(transform);
  }
  
  const lines: string[] = [];
  
  for (const [directiveType, transforms] of byDirectiveType.entries()) {
    const successCount = transforms.filter(t => t.success).length;
    const failCount = transforms.length - successCount;
    
    lines.push(chalk.cyan(`\nDirective Type: ${directiveType}`));
    lines.push(chalk.cyan(`Total transformations: ${transforms.length} (${successCount} success, ${failCount} fail)`));
    
    transforms.forEach((transform, i) => {
      const statusColor = transform.success ? chalk.green : chalk.red;
      const status = transform.success ? 'SUCCESS' : 'FAILED';
      
      lines.push(chalk.dim(`\nTransformation #${i + 1}:`));
      lines.push(`Status: ${statusColor(status)}`);
      lines.push(`Node Type: ${transform.nodeType}`);
      
      if (transform.success) {
        if (transform.transformedNode.type) {
          lines.push(`Transformed To: ${transform.transformedNode.type}`);
        } else if (transform.transformedNode.replaced) {
          lines.push(`Replaced: ${transform.transformedNode.replaced}`);
        }
      } else if (transform.error) {
        lines.push(`Error: ${chalk.red(transform.error)}`);
      }
    });
  }
  
  return lines.join('\n');
}

/**
 * Generate a Mermaid diagram of the transformations
 */
function generateMermaidDiagram(transformations: Array<any>): string {
  if (transformations.length === 0) {
    return 'graph TD\n  A[No transformations] --> B[captured]';
  }
  
  const lines = ['graph TD'];
  
  // Add nodes for each transformation
  transformations.forEach((transform, i) => {
    const nodeId = `node_${i}`;
    const resultId = `result_${i}`;
    const label = `${transform.directiveType}\\n${transform.nodeType}`;
    const resultLabel = transform.success 
      ? 'Transformed' 
      : `Failed\\n${transform.error ? transform.error.substring(0, 20) : 'Error'}`;
    
    lines.push(`  ${nodeId}["${label}"]`);
    lines.push(`  ${resultId}["${resultLabel}"]`);
    lines.push(`  ${nodeId} --> ${resultId}`);
    
    // Add styling
    if (transform.success) {
      lines.push(`  style ${resultId} fill:#90EE90`);
    } else {
      lines.push(`  style ${resultId} fill:#FFCCCB`);
    }
    
    // Connect to next transformation if exists
    if (i < transformations.length - 1) {
      lines.push(`  ${resultId} --> node_${i+1}`);
    }
  });
  
  return lines.join('\n');
} 