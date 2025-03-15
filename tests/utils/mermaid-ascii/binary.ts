/**
 * Binary management for mermaid-ascii
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { execSync } from 'child_process';

// Binary configuration
const BINARY_NAME = process.platform === 'win32' ? 'mermaid-ascii.exe' : 'mermaid-ascii';
const BINARY_VERSION = '0.1.0'; // Set the expected version
const BINARY_PATH = path.join(__dirname, 'bin', BINARY_NAME);

/**
 * Get the current platform identifier
 */
export function getPlatform(): string {
  const platform = process.platform;
  const arch = process.arch;
  
  // Map platform and architecture to release identifiers
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-amd64';
  } else if (platform === 'win32') {
    return 'windows-amd64';
  }
  
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

/**
 * Get the local path to the mermaid-ascii binary
 */
export function getBinaryPath(): string {
  return BINARY_PATH;
}

/**
 * Check if the mermaid-ascii binary exists and is executable
 */
export async function isBinaryAvailable(): Promise<boolean> {
  try {
    // Check if the file exists
    await fs.promises.access(BINARY_PATH, fs.constants.X_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the download URL for the current platform
 */
export function getDownloadUrl(): string {
  const platform = getPlatform();
  return `https://github.com/mermaid-js/mermaid-ascii/releases/download/v${BINARY_VERSION}/mermaid-ascii-${platform}.tar.gz`;
}

/**
 * Download the mermaid-ascii binary
 */
export async function downloadBinary(): Promise<boolean> {
  const downloadUrl = getDownloadUrl();
  const tempFile = path.join(os.tmpdir(), `mermaid-ascii-${Date.now()}.tar.gz`);
  
  return new Promise<boolean>((resolve, reject) => {
    const file = fs.createWriteStream(tempFile);
    
    console.log(`Downloading mermaid-ascii from ${downloadUrl}...`);
    
    https.get(downloadUrl, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        
        console.log('Download complete, extracting...');
        try {
          const targetDir = path.dirname(BINARY_PATH);
          fs.mkdirSync(targetDir, { recursive: true });
          
          // Extract using tar or a similar command
          if (process.platform === 'win32') {
            // On Windows, we would typically use a different approach
            // This is simplified for the example
            console.log('Extraction on Windows is not implemented in this example');
            resolve(false);
          } else {
            execSync(`tar -xzf ${tempFile} -C ${targetDir}`);
            execSync(`chmod +x ${BINARY_PATH}`);
            fs.unlinkSync(tempFile);
            console.log('Extraction complete');
            resolve(true);
          }
        } catch (error) {
          console.error('Extraction failed:', error);
          reject(error);
        }
      });
    }).on('error', (error) => {
      fs.unlinkSync(tempFile);
      console.error('Download failed:', error);
      reject(error);
    });
  });
}

/**
 * Get the version of the mermaid-ascii binary
 */
export async function getBinaryVersion(): Promise<string> {
  try {
    if (!(await isBinaryAvailable())) {
      return 'Not installed';
    }
    
    const output = execSync(`${BINARY_PATH} --version`).toString().trim();
    return output;
  } catch (error) {
    console.error('Failed to get binary version:', error);
    return 'Unknown';
  }
}

/**
 * Ensure the binary is available, downloading it if necessary
 */
export async function ensureBinaryAvailable(): Promise<boolean> {
  if (await isBinaryAvailable()) {
    return true;
  }
  
  console.log('mermaid-ascii binary not found, attempting to download...');
  return downloadBinary();
}