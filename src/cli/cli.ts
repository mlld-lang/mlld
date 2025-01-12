import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import fs from 'fs/promises';
import { parseMeldContent } from '../interpreter/parser.js';
import { interpret } from '../interpreter/interpreter.js';
import { InterpreterState } from '../interpreter/state/state.js';
import { mdToLlm, mdToMarkdown } from 'md-llm';

// Supported file extensions
const VALID_EXTENSIONS = ['.meld', '.meld.md', '.mll', '.mll.md'];

// Output format types
type OutputFormat = 'llm' | 'md' | 'xml' | 'llmxml' | 'markdown';

// Normalize format aliases
function normalizeFormat(format: string): OutputFormat {
  switch (format.toLowerCase()) {
    case 'xml':
    case 'llmxml':
      return 'llm';
    case 'markdown':
      return 'md';
    case 'llm':
    case 'md':
      return format as OutputFormat;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Validate file extension
function validateFileExtension(filePath: string): void {
  if (!filePath) {
    throw new Error('File path is required');
  }
  const ext = VALID_EXTENSIONS.find(e => filePath.endsWith(e));
  if (!ext) {
    throw new Error(`Invalid file extension. Supported extensions: ${VALID_EXTENSIONS.join(', ')}`);
  }
}

// Get default output path
function getDefaultOutputPath(inputPath: string, format: OutputFormat): string {
  if (!inputPath) {
    throw new Error('Input path is required');
  }
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext)
    .replace(/\.meld$/, '')
    .replace(/\.mll$/, '');
  return path.join(dir, `${baseName}.${format}`);
}

// Convert state to output format using md-llm
async function stateToOutput(state: InterpreterState, format: OutputFormat): Promise<string> {
  const nodes = state.getNodes();
  
  // Convert nodes to markdown
  const content = nodes
    .map(node => {
      if (node.type === 'Text') {
        return node.content;
      } else if (node.type === 'CodeFence') {
        return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\``;
      }
      return '';
    })
    .join('\n');

  // Convert to requested format using md-llm
  if (format === 'llm') {
    return await mdToLlm(content);
  } else {
    return await mdToMarkdown(content);
  }
}

// Main CLI function
export async function cli(args: string[]): Promise<void> {
  const argv = await yargs(hideBin(args))
    .positional('input', {
      describe: 'Input file path',
      type: 'string',
      demandOption: true
    })
    .option('output', {
      alias: 'o',
      describe: 'Output file path',
      type: 'string'
    })
    .option('format', {
      alias: 'f',
      describe: 'Output format (llm, md, xml)',
      type: 'string',
      default: 'llm'
    })
    .option('stdout', {
      describe: 'Print to stdout instead of file',
      type: 'boolean',
      default: false
    })
    .argv;

  const inputPath = argv.input;
  const format = normalizeFormat(argv.format);
  const outputPath = argv.output || getDefaultOutputPath(inputPath, format);

  // Validate input file extension
  validateFileExtension(inputPath);

  // Read and parse input file
  let content: string;
  try {
    content = await fs.readFile(inputPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }

  // Parse and interpret content
  const nodes = parseMeldContent(content);
  const state = new InterpreterState();
  await interpret(nodes, state);

  // Generate output
  const output = await stateToOutput(state, format);

  // Write output
  if (argv.stdout) {
    console.log(output);
  } else {
    try {
      await fs.writeFile(outputPath, output);
      console.log(`Output written to: ${outputPath}`);
    } catch (error) {
      throw new Error(`Failed to write output: ${error.message}`);
    }
  }
} 