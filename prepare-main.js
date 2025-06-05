#!/usr/bin/env node

/**
 * prepare-main.js
 * 
 * This script prepares a clean version of the repository for the main branch
 * by removing development-only files and directories.
 * 
 * Usage: npm run prepare-main
 * 
 * Note: If you have GitHub Actions configured, the auto-clean-main workflow
 * will handle this automatically when you create a PR from dev to main.
 * This script is useful for local testing or manual releases.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directories to remove for public release
const DEV_DIRS = [
  '_meld',
  '_issues',
  'dev',
  'tmp',
  'logs',
  'error-display-demo',
  'docs/dev',  // Development documentation
  '.claude',   // Claude AI files
  '.windsurf', // Windsurf AI files
  '.continue', // Continue AI files
  '.aider',    // Aider AI files
  '.sourcegraph' // Sourcegraph Cody files
];

// File patterns to remove
const DEV_FILE_PATTERNS = [
  'diff.txt',
  'test_*.txt',
  'test_*.mjs',
  'test_output.log',
  'repomix-output.xml',
  '.repomixignore',
  'prepare-main.js',  // This script itself
  'CLAUDE.md',        // Claude AI instructions
  'AGENTS.md',        // AI agent instructions
  '.cursorrules',     // Cursor AI rules
  '.aidigestignore',  // AI Digest ignore file
  'cursor.md',        // Cursor instructions
  '.cursorignore',    // Cursor ignore file
  '.copilotignore',   // GitHub Copilot ignore
  '.sourcery.yaml',   // Sourcery AI config
  'windsurf.md',      // Windsurf instructions
  '.windsurf*'        // Any windsurf config files
];

// Check if we're on the dev branch
function checkBranch() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (branch !== 'dev') {
      console.error('❌ This script must be run from the dev branch');
      console.error(`   Current branch: ${branch}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to check current branch:', error.message);
    process.exit(1);
  }
}

// Check for uncommitted changes
function checkCleanWorkingDirectory() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.error('❌ Working directory is not clean. Commit or stash changes first.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to check git status:', error.message);
    process.exit(1);
  }
}

// Remove a directory recursively
function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`  Removing directory: ${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// Remove files matching patterns
function removeMatchingFiles(pattern) {
  try {
    const files = execSync(`find . -name "${pattern}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(Boolean);
    
    files.forEach(file => {
      console.log(`  Removing file: ${file}`);
      fs.unlinkSync(file);
    });
  } catch (error) {
    // No matching files found is okay
  }
}

// Main execution
function main() {
  console.log('🚀 Preparing clean main branch...\n');
  
  // Verify we're on dev branch and have clean working directory
  checkBranch();
  checkCleanWorkingDirectory();
  
  console.log('✅ On dev branch with clean working directory\n');
  
  // Create a temporary branch for the clean version
  console.log('📝 Creating temporary clean branch...');
  try {
    execSync('git checkout -b temp-clean-main');
  } catch (error) {
    console.error('❌ Failed to create temporary branch:', error.message);
    process.exit(1);
  }
  
  // Remove development directories
  console.log('\n🗑️  Removing development directories...');
  DEV_DIRS.forEach(removeDirectory);
  
  // Remove development files
  console.log('\n🗑️  Removing development files...');
  DEV_FILE_PATTERNS.forEach(removeMatchingFiles);
  
  // Commit the changes
  console.log('\n📦 Committing clean version...');
  try {
    execSync('git add -A');
    execSync('git commit -m "chore: prepare clean version for main branch"');
  } catch (error) {
    console.error('❌ Failed to commit changes:', error.message);
    execSync('git checkout dev');
    execSync('git branch -D temp-clean-main');
    process.exit(1);
  }
  
  // Force update main branch
  console.log('\n🔄 Updating main branch...');
  try {
    execSync('git checkout main');
    execSync('git reset --hard temp-clean-main');
    console.log('✅ Main branch updated successfully!');
  } catch (error) {
    console.error('❌ Failed to update main branch:', error.message);
    execSync('git checkout dev');
    execSync('git branch -D temp-clean-main');
    process.exit(1);
  }
  
  // Clean up
  console.log('\n🧹 Cleaning up...');
  execSync('git checkout dev');
  execSync('git branch -D temp-clean-main');
  
  console.log('\n✨ Done! Main branch has been updated with a clean version.');
  console.log('   Remember to push with: git push --force-with-lease origin main');
}

// Run if called directly
if (require.main === module) {
  main();
}