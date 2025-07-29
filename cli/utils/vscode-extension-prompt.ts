import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Checks if running in VSCode terminal and prompts to install extension
 */
export function checkVSCodeExtension(): void {
  // Check if running in VSCode terminal
  if (!process.env.TERM_PROGRAM?.includes('vscode')) {
    return;
  }

  // Check if extension is already installed
  try {
    const extensions = execSync('code --list-extensions', { encoding: 'utf8' });
    if (extensions.includes('andyet.mlld-vscode')) {
      return;
    }
  } catch {
    // 'code' command not available, skip
    return;
  }

  // Check if we've already prompted (store in user's home config)
  const configPath = path.join(process.env.HOME || '', '.config', 'mlld', 'prompted-vscode');
  if (fs.existsSync(configPath)) {
    return;
  }

  console.log('\n📦 VSCode Extension Available!');
  console.log('Install the mlld extension for:');
  console.log('  • Syntax highlighting');
  console.log('  • Autocomplete');
  console.log('  • Error checking');
  console.log('  • Go to definition');
  console.log('  • Semantic highlighting\n');
  console.log('Install now with:');
  console.log('  code --install-extension andyet.mlld-vscode\n');

  // Mark as prompted
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, new Date().toISOString());
  } catch {
    // Ignore errors
  }
}