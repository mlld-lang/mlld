import { createInterface } from 'readline';
import { existsSync } from 'fs';
import type { CLIOptions } from '../index';

export interface OverwriteResult {
  outputPath: string;
  shouldOverwrite: boolean;
}

export class UserInteraction {
  private currentCLIOptions: CLIOptions | null = null;

  setCurrentCLIOptions(options: CLIOptions): void {
    this.currentCLIOptions = options;
  }

  getCurrentCLIOptions(): CLIOptions {
    if (!this.currentCLIOptions) {
      throw new Error('CLI options not initialized');
    }
    return this.currentCLIOptions;
  }

  async confirmOverwrite(filePath: string): Promise<OverwriteResult> {
    // In test mode, always return true to allow overwriting
    if (process.env.NODE_ENV === 'test') {
      return { outputPath: filePath, shouldOverwrite: true };
    }

    // Get the current CLI options from the outer scope
    const cliOptions = this.getCurrentCLIOptions();

    // If output path was not explicitly set, we're using the safe path from OutputPathService
    // so we can just return it
    if (!cliOptions.output) {
      return { outputPath: filePath, shouldOverwrite: true };
    }

    // Check if we can use raw mode (might not be available in all environments)
    const canUseRawMode = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

    // If raw mode isn't available, fall back to readline
    if (!canUseRawMode) {
      return this.confirmOverwriteWithReadline(filePath);
    }

    // Use raw mode to detect a single keypress
    return this.confirmOverwriteWithRawMode(filePath);
  }

  private async confirmOverwriteWithReadline(filePath: string): Promise<OverwriteResult> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`File ${filePath} already exists. Overwrite? [Y/n] `, (answer) => {
        rl.close();

        // If user doesn't want to overwrite, find an incremental filename
        if (answer.toLowerCase() === 'n') {
          const newPath = this.findAvailableIncrementalFilename(filePath);
          console.log(`Using alternative filename: ${newPath}`);
          resolve({ outputPath: newPath, shouldOverwrite: true });
        } else {
          resolve({ outputPath: filePath, shouldOverwrite: true });
        }
      });
    });
  }

  private async confirmOverwriteWithRawMode(filePath: string): Promise<OverwriteResult> {
    // Use raw mode to detect a single keypress
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdout.write(`File ${filePath} already exists. Overwrite? [Y/n] `);

    return new Promise((resolve) => {
      const onKeypress = (key: string) => {
        // Ctrl-C
        if (key === '\u0003') {
          process.stdout.write('\n');
          process.exit(0);
        }

        // Convert to lowercase for comparison
        const keyLower = key.toLowerCase();

        // Only process y, n, or enter (which is '\r' in raw mode)
        if (keyLower === 'y' || keyLower === 'n' || key === '\r') {
          // Echo the key (since raw mode doesn't show keystrokes)
          process.stdout.write(key === '\r' ? 'y\n' : `${key}\n`);

          // Restore the terminal to cooked mode
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onKeypress);

          // If user doesn't want to overwrite or pressed Enter (default to Y), find an incremental filename
          if (keyLower === 'n') {
            const newPath = this.findAvailableIncrementalFilename(filePath);
            console.log(`Using alternative filename: ${newPath}`);
            resolve({ outputPath: newPath, shouldOverwrite: true });
          } else {
            resolve({ outputPath: filePath, shouldOverwrite: true });
          }
        }
      };

      // Listen for keypresses
      process.stdin.on('data', onKeypress);
    });
  }

  findAvailableIncrementalFilename(filePath: string): string {
    // Extract the base name and extension
    const lastDotIndex = filePath.lastIndexOf('.');
    const baseName = lastDotIndex !== -1 ? filePath.slice(0, lastDotIndex) : filePath;
    const extension = lastDotIndex !== -1 ? filePath.slice(lastDotIndex) : '';

    // Try incremental filenames until we find one that doesn't exist
    let counter = 1;
    let newPath = `${baseName}-${counter}${extension}`;

    while (existsSync(newPath)) {
      counter++;
      newPath = `${baseName}-${counter}${extension}`;
    }

    return newPath;
  }

  detectTerminalCapabilities(): { canUseRawMode: boolean; isTTY: boolean } {
    return {
      canUseRawMode: process.stdin.isTTY && typeof process.stdin.setRawMode === 'function',
      isTTY: !!process.stdin.isTTY
    };
  }
}