#!/usr/bin/env node

import { container } from 'tsyringe';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';

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
    // Get required services
    const stateService = container.resolve<IStateService>('StateService');
    const parserService = container.resolve<IParserService>('ParserService');
    const interpreterService = container.resolve<IInterpreterService>('InterpreterService');
    const fileSystemService = container.resolve<IFileSystemService>('FileSystemService');
    const directiveService = container.resolve<IDirectiveService>('DirectiveService');
    
    // Enable transformation tracking
    if (!interpreterService.canHandleTransformations()) {
      console.error(chalk.red('This interpreter does not support transformations'));
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
      const directiveKind = node.directive?.kind || 'unknown';
      
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
      output = generateMermaidDiagram(transformations);
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
    console.error(chalk.red(`Error debugging transformations: ${error instanceof Error ? error.message : String(error)}`));
    if (error instanceof Error && error.stack) {
      console.error(chalk.dim(error.stack));
    }
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