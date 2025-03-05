#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PUBLIC_BRANCH = 'public';
const DEVELOPMENT_BRANCH = 'dev'; 
const IGNORED_DIRS = [
  '_issues',
  '_meld',
  'dev',
  'logs',
  'tmp',
  'error-display-demo'
];
const IGNORED_PATTERNS = [
  '*.log',
  '*.tmp',
  '.DS_Store'
];

// Utility function to run git commands
function git(command) {
  console.log(`Running: git ${command}`);
  return execSync(`git ${command}`, { stdio: 'inherit' });
}

// Make sure we have latest changes
git(`fetch origin ${DEVELOPMENT_BRANCH}`);
git(`fetch origin ${PUBLIC_BRANCH}`);

// Check if public branch exists
let publicBranchExists = false;
try {
  execSync(`git branch --list ${PUBLIC_BRANCH}`, { stdio: 'pipe' }).toString().trim() !== '';
  publicBranchExists = true;
} catch (e) {
  console.log(`Public branch ${PUBLIC_BRANCH} doesn't exist yet. Will create it.`);
}

// If public branch exists, check it out, otherwise create it
if (publicBranchExists) {
  git(`checkout ${PUBLIC_BRANCH}`);
  git(`reset --hard origin/${PUBLIC_BRANCH}`);
} else {
  // Create a new branch from development
  git(`checkout -b ${PUBLIC_BRANCH} origin/${DEVELOPMENT_BRANCH}`);
}

// Remove ignored directories and files
console.log('\nRemoving ignored files and directories...');

// Remove directories
IGNORED_DIRS.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (fs.existsSync(dirPath)) {
    console.log(`Removing directory: ${dir}`);
    try {
      execSync(`git rm -rf --cached ${dir}`, { stdio: 'pipe' });
    } catch (e) {
      console.log(`Warning: Could not remove ${dir} from git index: ${e.message}`);
    }
    
    // Add directory to .gitignore if not already there
    try {
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      if (!gitignore.includes(`/${dir}/`)) {
        fs.appendFileSync('.gitignore', `\n/${dir}/`);
        git('add .gitignore');
      }
    } catch (e) {
      console.error(`Error updating .gitignore: ${e.message}`);
    }
  }
});

// Remove pattern matches
IGNORED_PATTERNS.forEach(pattern => {
  try {
    const files = execSync(`git ls-files "${pattern}"`, { stdio: 'pipe' }).toString().trim().split('\n');
    if (files.length && files[0] !== '') {
      console.log(`Removing files matching pattern: ${pattern}`);
      files.forEach(file => {
        console.log(`  - ${file}`);
        try {
          execSync(`git rm --cached "${file}"`, { stdio: 'pipe' });
        } catch (e) {
          console.log(`Warning: Could not remove ${file} from git index: ${e.message}`);
        }
      });
      
      // Add pattern to .gitignore if not already there
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      if (!gitignore.includes(pattern)) {
        fs.appendFileSync('.gitignore', `\n${pattern}`);
        git('add .gitignore');
      }
    }
  } catch (e) {
    console.error(`Error processing pattern ${pattern}: ${e.message}`);
  }
});

// Commit changes
try {
  git('add .');
  execSync('git commit -m "Update public branch: Remove development files"', { stdio: 'inherit' });
} catch (e) {
  console.log('No changes to commit or commit failed');
}

// Push to remote
console.log('\nPushing public branch to remote...');
git(`push origin ${PUBLIC_BRANCH}`);

console.log(`\nDone! The ${PUBLIC_BRANCH} branch has been updated and pushed.`);
console.log(`You can now switch back to your development branch: git checkout ${DEVELOPMENT_BRANCH}`);