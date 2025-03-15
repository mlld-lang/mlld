/**
 * Mermaid ASCII Wrapper
 * 
 * A simple wrapper around the mermaid-ascii Go tool to convert Mermaid diagrams to ASCII art.
 * Based on https://github.com/AlexanderGrooff/mermaid-ascii
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { 
  getBinaryPath, 
  isBinaryAvailable, 
  getBinaryVersion, 
  ensureBinaryAvailable 
} from '@tests/utils/mermaid-ascii/binary.js';

/**
 * Options for mermaid-ascii conversion
 */
export interface MermaidAsciiOptions {
  /**
   * Width in characters for the ASCII output
   */
  width?: number;
  
  /**
   * Height in characters for the ASCII output
   */
  height?: number;
  
  /**
   * Whether to use ANSI color in the output
   */
  color?: boolean;
}

/**
 * Convert a Mermaid diagram to ASCII art
 * 
 * @param mermaidContent The Mermaid diagram content
 * @param options Configuration options for the ASCII output
 * @returns The ASCII representation of the diagram
 */
export async function mermaidToAscii(mermaidContent: string, options: MermaidAsciiOptions = {}): Promise<string> {
  // Ensure the binary is available
  const binaryAvailable = await ensureBinaryAvailable();
  if (!binaryAvailable) {
    throw new Error('The mermaid-ascii binary is not available. Please check the logs for details.');
  }
  
  // Create temporary file for the Mermaid content
  const tempDir = os.tmpdir();
  const tempInputFile = path.join(tempDir, `mermaid-input-${Date.now()}.mmd`);
  const tempOutputFile = path.join(tempDir, `mermaid-output-${Date.now()}.txt`);
  
  try {
    // Write Mermaid content to temp file
    fs.writeFileSync(tempInputFile, mermaidContent, 'utf8');
    
    // Build the command with options
    let command = `"${getBinaryPath()}" "${tempInputFile}" -o "${tempOutputFile}"`;
    
    if (options.width) {
      command += ` -w ${options.width}`;
    }
    
    if (options.height) {
      command += ` -h ${options.height}`;
    }
    
    if (options.color !== undefined) {
      command += options.color ? ' --color' : ' --no-color';
    }
    
    // Execute the command
    execSync(command, { encoding: 'utf8' });
    
    // Read the output
    if (fs.existsSync(tempOutputFile)) {
      return fs.readFileSync(tempOutputFile, 'utf8');
    } else {
      // Fallback: if for some reason the output file wasn't created,
      // return a simple representation of the diagram type
      const diagramType = mermaidContent.trim().split('\n')[0].trim();
      return `[ASCII representation of ${diagramType}]`;
    }
  } catch (error) {
    console.error('Error converting Mermaid to ASCII:', error);
    throw error;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempInputFile)) {
        fs.unlinkSync(tempInputFile);
      }
      if (fs.existsSync(tempOutputFile)) {
        fs.unlinkSync(tempOutputFile);
      }
    } catch (error) {
      console.warn('Failed to clean up temporary files:', error);
    }
  }
}

// Export utility functions
export { isBinaryAvailable, getBinaryVersion, getBinaryPath };