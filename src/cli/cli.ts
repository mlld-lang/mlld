import * as fs from 'fs/promises';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parseMeldContent } from '../interpreter/parser.js';
import { interpret } from '../interpreter/interpreter.js';
import { InterpreterState } from '../interpreter/state/state.js';
import { convertToFormat } from '../converter/converter.js';

export type OutputFormat = 'llm' | 'md';

const VALID_EXTENSIONS = ['.meld', '.meld.md', '.mll', '.mll.md'];

function normalizeFormat(format: string): OutputFormat {
  const formatMap: Record<string, OutputFormat> = {
    llm: 'llm',
    md: 'md',
    markdown: 'md',
    xml: 'llm'
  };
  return formatMap[format.toLowerCase()] || 'llm';
}

function validateFileExtension(filePath: string): void {
  const ext = VALID_EXTENSIONS.find(e => filePath.endsWith(e));
  if (!ext) {
    throw new Error(`Invalid file extension. Supported extensions: ${VALID_EXTENSIONS.join(', ')}`);
  }
}

function getDefaultOutputPath(inputPath: string, format: OutputFormat): string {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.${format}`);
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
    .option('output', {
      describe: 'Output file path',
      type: 'string'
    })
    .option('format', {
      describe: 'Output format',
      type: 'string',
      choices: ['llm', 'md'],
      default: 'llm'
    })
    .option('stdout', {
      describe: 'Write output to stdout instead of file',
      type: 'boolean',
      default: false
    })
    .help()
    .argv;

  const inputPath = argv.input;
  let format = normalizeFormat(argv.format as OutputFormat);
  let outputPath = argv.output;

  // First check if file exists and can be read
  let content: string;
  try {
    content = await fs.readFile(inputPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw err;
  }

  // Then validate file extension
  validateFileExtension(inputPath);

  // Parse and interpret content
  const state = new InterpreterState();
  const nodes = parseMeldContent(content);
  await interpret(nodes, state);

  // Convert to output format
  const output = convertToFormat(state.getNodes(), format);

  // Write output
  if (argv.stdout) {
    console.log(output);
  } else {
    outputPath = outputPath || getDefaultOutputPath(inputPath, format);
    await fs.writeFile(outputPath, output);
    console.log(`Output written to: ${outputPath}`);
  }
} 