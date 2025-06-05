#!/usr/bin/env node

/**
 * Clean up locally installed mlld-* commands.
 * 
 * Usage:
 *   node scripts/clean-local.js              # removes all mlld-* commands
 *   node scripts/clean-local.js myname       # removes only mlld-myname
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

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

// Sanitize branch/alias name for use as a command
function sanitizeName(name) {
  // Replace non-alphanumeric characters with hyphens
  return name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
}

// Main cleanup logic
async function cleanLocal() {
  const args = process.argv.slice(2);
  const specificAlias = args[0];
  
  const projectRoot = process.cwd();
  const metadataPath = path.join(projectRoot, '.mlld-local-installs.json');
  const globalBinDir = getGlobalBinDir();
  
  if (specificAlias) {
    const commandName = `mlld-${sanitizeName(specificAlias)}`;
    console.log(`Cleaning up ${commandName}...\n`);
  } else {
    console.log('Cleaning up all mlld-* commands...\n');
  }
  
  let removedCount = 0;
  
  try {
    // First, try to use our metadata file
    if (await fs.exists(metadataPath)) {
      const metadata = await fs.readJson(metadataPath);
      
      if (specificAlias) {
        // Remove only the specific command
        const commandName = `mlld-${sanitizeName(specificAlias)}`;
        if (metadata[commandName]) {
          const targetPath = metadata[commandName].targetPath || path.join(globalBinDir, commandName);
          
          if (await fs.exists(targetPath)) {
            console.log(`Removing: ${commandName}`);
            await fs.remove(targetPath);
            removedCount++;
          }
          
          // Remove from metadata
          delete metadata[commandName];
          
          // Update or remove the metadata file
          if (Object.keys(metadata).length > 0) {
            await fs.writeJson(metadataPath, metadata, { spaces: 2 });
          } else {
            await fs.remove(metadataPath);
          }
        }
      } else {
        // Remove all commands
        for (const [commandName, info] of Object.entries(metadata)) {
          const targetPath = info.targetPath || path.join(globalBinDir, commandName);
          
          if (await fs.exists(targetPath)) {
            console.log(`Removing: ${commandName}`);
            await fs.remove(targetPath);
            removedCount++;
          }
        }
        
        // Remove the metadata file
        await fs.remove(metadataPath);
      }
    }
    
    // Also scan the global bin directory for any mlld-* commands we might have missed
    const files = await fs.readdir(globalBinDir);
    
    for (const file of files) {
      if (file.startsWith('mlld-') && file !== 'mlld-wrapper.cjs') {
        // If we're looking for a specific alias, skip others
        if (specificAlias) {
          const targetCommand = `mlld-${sanitizeName(specificAlias)}`;
          if (file !== targetCommand) {
            continue;
          }
        }
        
        const filePath = path.join(globalBinDir, file);
        
        // Check if it's a symlink pointing to our project
        try {
          const stats = await fs.lstat(filePath);
          if (stats.isSymbolicLink()) {
            const linkTarget = await fs.readlink(filePath);
            const resolvedTarget = path.resolve(globalBinDir, linkTarget);
            
            // Check if it points to our project
            if (resolvedTarget.startsWith(projectRoot)) {
              console.log(`Removing: ${file}`);
              await fs.remove(filePath);
              removedCount++;
            }
          }
        } catch (error) {
          // Ignore errors reading individual files
        }
      }
    }
    
    if (removedCount === 0) {
      console.log('No mlld-* commands found to remove.');
    } else {
      console.log(`\n✅ Removed ${removedCount} command(s).`);
    }
    
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanLocal().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});