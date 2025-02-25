import * as fs from 'fs/promises';
import * as path from 'path';
import { createInterface } from 'readline';

/**
 * Initialize a new Meld project by creating a meld.json file
 */
export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  
  // Check if meld.json already exists
  try {
    await fs.access(path.join(cwd, 'meld.json'));
    console.error('Error: meld.json already exists in this directory.');
    process.exit(1);
  } catch (e) {
    // File doesn't exist, continue
  }
  
  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Prompt for project root
  const projectRoot = await new Promise<string>((resolve) => {
    rl.question('Project root (must be "." or a subdirectory): ', (answer) => {
      resolve(answer || '.');
    });
  });
  
  // Validate the input
  if (!isValidSubdirectory(projectRoot)) {
    console.error('Error: Project root must be "." or a valid subdirectory.');
    rl.close();
    process.exit(1);
  }
  
  // Create config
  const config = {
    projectRoot,
    version: 1
  };
  
  // Write config file
  await fs.writeFile(
    path.join(cwd, 'meld.json'),
    JSON.stringify(config, null, 2)
  );
  
  console.log(`Meld project initialized successfully.`);
  console.log(`Project root set to: ${path.resolve(cwd, projectRoot)}`);
  
  rl.close();
}

/**
 * Validate that a path is a valid subdirectory
 */
function isValidSubdirectory(dirPath: string): boolean {
  if (dirPath === '.') return true;
  
  // Must not contain path traversal
  if (dirPath.includes('..')) return false;
  
  // Must be relative
  if (path.isAbsolute(dirPath)) return false;
  
  // Must not escape current directory
  const normalized = path.normalize(dirPath);
  if (normalized.startsWith('..')) return false;
  
  return true;
} 