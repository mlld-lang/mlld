import { resolve } from 'path';
import { promises as fs } from 'fs';
import { runMeld } from '../sdk/index.js';
import { interpreterLogger } from '../utils/logger';

interface CliOptions {
  input: string;
  output?: string;
  format?: 'md' | 'llm';
}

// Helper to handle errors based on environment
function handleError(error: unknown): never {
  interpreterLogger.error('CLI execution failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  
  // In test mode, throw the error instead of exiting
  if (process.env.NODE_ENV === 'test') {
    throw error;
  }
  
  process.exit(1);
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliOptions {
  interpreterLogger.debug('Parsing CLI arguments', { args });
  
  const options: CliOptions = {
    input: '',
    format: 'llm'
  };

  try {
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--input' || arg === '-i') {
        options.input = args[++i];
      } else if (arg === '--output' || arg === '-o') {
        options.output = args[++i];
      } else if (arg === '--format' || arg === '-f') {
        const format = args[++i];
        if (format !== 'md' && format !== 'llm') {
          throw new Error('Format must be either "md" or "llm"');
        }
        options.format = format;
      } else {
        options.input = arg;
      }
    }

    if (!options.input) {
      throw new Error('Input file is required');
    }

    interpreterLogger.debug('Successfully parsed CLI arguments', { options });
    return options;
  } catch (error) {
    interpreterLogger.error('Failed to parse CLI arguments', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Run the CLI
 */
export async function run(args: string[]): Promise<void> {
  interpreterLogger.info('Starting CLI execution', { args });
  
  try {
    const options = parseArgs(args);
    const inputFile = resolve(options.input);
    const outputFile = options.output ? resolve(options.output) : undefined;

    interpreterLogger.debug('Resolved file paths', {
      inputFile,
      outputFile,
      format: options.format
    });

    // Run Meld using the SDK function
    const output = await runMeld(inputFile, {
      format: options.format
    });

    // Write output
    if (outputFile) {
      await fs.writeFile(outputFile, output);
      interpreterLogger.info('Successfully wrote output to file', { outputFile });
    } else {
      // Still use console.log for actual output to stdout
      console.log(output);
      interpreterLogger.info('Successfully wrote output to stdout');
    }
  } catch (error) {
    handleError(error);
  }
}

export const cmd = run;

// Run if called directly
if (require.main === module) {
  run(process.argv).catch(handleError);
} 