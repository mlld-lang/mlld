import { resolve } from 'path';
import { promises as fs } from 'fs';
import { runMeld } from '../sdk/index.js';

interface CliOptions {
  input: string;
  output?: string;
  format?: 'md' | 'llm';
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: '',
    format: 'llm'
  };

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

  return options;
}

/**
 * Run the CLI
 */
export async function run(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const inputFile = resolve(options.input);
  const outputFile = options.output ? resolve(options.output) : undefined;

  try {
    // Run Meld using the SDK function
    const output = await runMeld(inputFile, {
      format: options.format
    });

    // Write output
    if (outputFile) {
      await fs.writeFile(outputFile, output);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export const cli = run;

// Run if called directly
if (require.main === module) {
  run(process.argv).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
} 