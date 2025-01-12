import { existsSync } from 'fs';
import { join } from 'path';
import { runMeld } from '../sdk/index.js';

const VALID_EXTENSIONS = ['.meld', '.meld.md', '.mll', '.mll.md'];

function validateFileExtension(filePath: string): void {
  const ext = VALID_EXTENSIONS.find(e => filePath.endsWith(e));
  if (!ext) {
    throw new Error(`Invalid file extension. Supported extensions: ${VALID_EXTENSIONS.join(', ')}`);
  }
}

function validateFile(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error('File not found');
  }
  validateFileExtension(filePath);
}

export async function cli(args: string[]): Promise<void> {
  const [,, inputFile, ...options] = args;
  
  if (!inputFile) {
    throw new Error('Input file is required');
  }

  // Validate file before processing
  validateFile(inputFile);

  // Parse options
  const format = options.includes('--md') ? 'md' : 'llm';
  const stdout = options.includes('--stdout');
  let outputFile = options.find(opt => opt.startsWith('--output='))?.split('=')[1];

  if (!stdout && !outputFile) {
    // Default output file
    const ext = format === 'md' ? '.md' : '.llm';
    outputFile = inputFile.replace(/\.(meld|mll)(\.md)?$/, ext);
  }

  // Run meld
  const { output } = await runMeld(inputFile, { format });

  if (stdout) {
    console.log(output);
  } else if (outputFile) {
    // Write to file
    await Bun.write(outputFile, output);
  }
}

// Only execute if run directly
if (process.argv[1] === import.meta.url) {
  cli(process.argv).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
} 