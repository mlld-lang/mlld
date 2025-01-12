import { promises as fs } from 'fs';
import { resolve } from 'path';
import { parseMeld } from '../interpreter/parser';
import { interpret } from '../interpreter/interpreter';
import { InterpreterState } from '../interpreter/state/state';
import { toMarkdown } from '../converter/converter';

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
      options.format = args[++i] as 'md' | 'llm';
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

  // Read and parse input
  const content = await fs.readFile(inputFile, 'utf8');
  const nodes = parseMeld(content);

  // Interpret nodes
  const state = new InterpreterState();
  interpret(nodes, state);

  // Convert to output format
  const output = toMarkdown(state.getNodes());

  // Write output
  if (outputFile) {
    await fs.writeFile(outputFile, output);
  } else {
    console.log(output);
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