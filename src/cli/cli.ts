import { promises as fs } from 'fs';
import { join, parse } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parseMeld, interpretMeld } from '../interpreter/interpreter.js';
import { convertToFormat } from '../converter/converter.js';

const VALID_EXTENSIONS = ['.meld', '.meld.md', '.mll', '.mll.md'];

function validateFileExtension(filePath: string): void {
  const ext = VALID_EXTENSIONS.find(e => filePath.endsWith(e));
  if (!ext) {
    throw new Error(`Invalid file extension. Supported extensions: ${VALID_EXTENSIONS.join(', ')}`);
  }
}

function getDefaultOutputPath(inputPath: string, format: string): string {
  const { dir, name } = parse(inputPath);
  return join(dir, `${name}.${format}`);
}

export async function cli(args: string[]): Promise<void> {
  const argv = await yargs(args)
    .command('$0 <input>', 'Convert meld file to specified format', (yargs) => {
      yargs.positional('input', {
        describe: 'Input file path',
        type: 'string',
        demandOption: true
      });
    })
    .option('format', {
      alias: 'f',
      describe: 'Output format (llm or md)',
      choices: ['llm', 'md'],
      default: 'llm'
    })
    .option('output', {
      alias: 'o',
      describe: 'Output file path'
    })
    .option('stdout', {
      describe: 'Write output to stdout instead of file',
      type: 'boolean',
      default: false
    })
    .help()
    .argv;

  const inputPath = argv.input as string;
  const format = argv.format as string;
  const stdout = argv.stdout as boolean;
  const outputPath = argv.output as string | undefined;

  // First validate file extension
  validateFileExtension(inputPath);

  // Then check if file exists and try to read it
  let content: string;
  try {
    content = await fs.readFile(inputPath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw new Error(`Failed to read file: ${err.message}`);
  }

  // Parse and interpret content
  const nodes = parseMeld(content);
  const state = interpretMeld(nodes);

  // Convert to specified format
  const output = convertToFormat(state, format);

  // Handle output
  if (stdout) {
    console.log(output);
  } else {
    const finalOutputPath = outputPath || getDefaultOutputPath(inputPath, format);
    await fs.writeFile(finalOutputPath, output);
  }
}

// Only execute if run directly
if (process.argv[1] === import.meta.url) {
  cli(hideBin(process.argv)).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
} 