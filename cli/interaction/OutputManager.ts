import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import type { CLIOptions } from '../index';
import type { UserInteraction, OverwriteResult } from './UserInteraction';

export interface OutputOptions {
  filePath?: string;
  stdout: boolean;
  format: string;
  overwriteConfirm: boolean;
}

export class OutputManager {
  constructor(private userInteraction: UserInteraction) {}

  async writeOutput(content: string, options: OutputOptions, cliOptions: CLIOptions): Promise<void> {
    if (options.stdout || !options.filePath) {
      await this.writeToStdout(content);
    } else {
      await this.writeToFile(content, options.filePath, options.overwriteConfirm, cliOptions);
    }
  }

  private async writeToStdout(content: string): Promise<void> {
    process.stdout.write(content);
  }

  private async writeToFile(
    content: string, 
    filePath: string, 
    confirmOverwrite: boolean,
    cliOptions: CLIOptions
  ): Promise<void> {
    let finalPath = filePath;
    
    // Check if file exists and handle overwrite confirmation
    if (existsSync(filePath) && confirmOverwrite) {
      const overwriteResult = await this.userInteraction.confirmOverwrite(filePath);
      finalPath = overwriteResult.outputPath;
    }

    // Ensure the directory exists
    const dir = path.dirname(finalPath);
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(finalPath, content, 'utf8');
  }

  setupOutputPath(cliOptions: CLIOptions): { outputPath?: string; stdout: boolean } {
    if (cliOptions.stdout) {
      return { stdout: true };
    }

    if (cliOptions.output) {
      return { 
        outputPath: cliOptions.output, 
        stdout: false 
      };
    }

    // No output specified, use stdout
    return { stdout: true };
  }

  validateOutputPath(outputPath: string): { isValid: boolean; error?: string } {
    try {
      // Check if the directory is writable
      const dir = path.dirname(outputPath);
      
      // If directory doesn't exist, that's okay - we'll create it
      if (!existsSync(dir)) {
        return { isValid: true };
      }

      // Check if it's actually a directory
      const stat = require('fs').statSync(dir);
      if (!stat.isDirectory()) {
        return { 
          isValid: false, 
          error: `Parent path ${dir} is not a directory` 
        };
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Cannot access output directory: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}