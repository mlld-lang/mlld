import * as path from 'path';
import { watch } from 'fs/promises';
import { logger } from '@core/utils/logger';
import type { CLIOptions } from '../index';

export class WatchManager {
  
  async watchFiles(options: CLIOptions, processFunction: (options: CLIOptions) => Promise<void>): Promise<void> {
    logger.info('Starting watch mode', { input: options.input });

    const inputPath = options.input;
    const watchDir = path.dirname(inputPath);

    try {
      console.log(`Watching for changes in ${watchDir}...`);
      const watcher = watch(watchDir, { recursive: true });

      for await (const event of watcher) {
        // Only process module files or the specific input file
        if (this.isModuleFile(event.filename, inputPath)) {
          console.log(`Change detected in ${event.filename}, reprocessing...`);
          await processFunction(options);
        }
      }
    } catch (error) {
      logger.error('Watch mode failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  setupWatcher(options: CLIOptions): void {
    // Future enhancement: setup file system watcher configuration
  }

  handleFileChange(filename: string, options: CLIOptions): boolean {
    // Determine if we should process this file change
    return this.isModuleFile(filename, options.input);
  }

  filterWatchEvents(event: any): boolean {
    // Future enhancement: more sophisticated event filtering
    return true;
  }

  private isModuleFile(filename: string | undefined, inputPath: string): boolean {
    if (!filename) return false;
    const inputName = path.basename(inputPath);
    const moduleExtensions = ['.mld', '.mld.md', '.mlld', '.mlld.md'];
    return filename === inputName || moduleExtensions.some(ext => filename.endsWith(ext));
  }
}
