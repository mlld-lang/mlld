#!/usr/bin/env node

/**
 * Install the mlld package locally with a custom command name using symlinks.
 * 
 * Usage:
 *   node scripts/install-local.js          # installs as mlld-<git-branch>
 *   node scripts/install-local.js myname   # installs as mlld-myname
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Get the current git branch name
function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('Could not determine git branch, using "local"');
    return 'local';
  }
}

// Sanitize branch/alias name for use as a command
function sanitizeName(name) {
  // Replace non-alphanumeric characters with hyphens
  return name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
}

// Get the npm global bin directory
function getGlobalBinDir() {
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
    // On Windows, binaries go directly in the prefix
    // On Unix-like systems, they go in prefix/bin
    return process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
  } catch (error) {
    console.error('Could not determine npm global bin directory');
    process.exit(1);
  }
}

// Main installation logic
async function installLocal() {
  const args = process.argv.slice(2);
  const alias = args[0];
  
  // Determine the command name
  let commandName;
  if (alias) {
    commandName = `mlld-${sanitizeName(alias)}`;
  } else {
    const branch = getGitBranch();
    commandName = `mlld-${sanitizeName(branch)}`;
  }
  
  console.log(`Installing as command: ${commandName}`);
  
  try {
    // Build the project first
    console.log('Building project...');
    execSync('npm run build', { stdio: 'inherit' });
    
    // Get paths
    const projectRoot = process.cwd();
    const wrapperPath = path.join(projectRoot, 'bin', 'mlld-wrapper.cjs');
    const globalBinDir = getGlobalBinDir();
    const targetPath = path.join(globalBinDir, commandName);
    
    // Ensure the wrapper exists
    if (!await fs.exists(wrapperPath)) {
      console.error(`Wrapper script not found at: ${wrapperPath}`);
      process.exit(1);
    }
    
    // Remove existing symlink if it exists
    if (await fs.exists(targetPath)) {
      console.log(`Removing existing ${commandName}...`);
      await fs.remove(targetPath);
    }
    
    // Create the symlink
    console.log(`Creating symlink: ${targetPath} -> ${wrapperPath}`);
    await fs.symlink(wrapperPath, targetPath);
    
    // Make it executable (symlink inherits permissions from target, but let's be sure)
    if (os.platform() !== 'win32') {
      await fs.chmod(targetPath, '755');
    }
    
    console.log(`\n✅ Successfully installed as: ${commandName}`);
    console.log(`You can now use: ${commandName} [options] [file]`);
    
    // Store metadata about this installation for cleanup
    const metadataPath = path.join(projectRoot, '.mlld-local-installs.json');
    let metadata = {};
    try {
      metadata = await fs.readJson(metadataPath);
    } catch (error) {
      // File doesn't exist yet
    }
    
    metadata[commandName] = {
      installedAt: new Date().toISOString(),
      targetPath,
      branch: getGitBranch()
    };
    
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    
  } catch (error) {
    console.error('Installation failed:', error);
    process.exit(1);
  }
}

// Run the installation
installLocal().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});