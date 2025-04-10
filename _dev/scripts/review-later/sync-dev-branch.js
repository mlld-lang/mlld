#!/usr/bin/env node

/**
 * This script syncs the current feature branch with the dev branch
 * It's useful for keeping feature branches up to date with the latest development changes
 * 
 * Note: The 'dev' branch is our full development branch with all resources
 */

const { execSync } = require('child_process');

// Print the output of commands
function run(command) {
  console.log(`Running: ${command}`);
  return execSync(command, { stdio: 'inherit' });
}

// Get current branch
const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
console.log(`Current branch: ${currentBranch}`);

// Check if current branch is dev
if (currentBranch === 'dev') {
  console.log('You are currently on the dev branch. No need to sync with itself.');
  process.exit(0);
}

// Check if current branch is public
if (currentBranch === 'public') {
  console.log('You are currently on the public branch. Use prepare-public.js script instead.');
  process.exit(1);
}

// Fetch latest changes from remote
console.log('Fetching latest changes from remote...');
run('git fetch origin');

// Stash any uncommitted changes
let stashNeeded = false;
const status = execSync('git status --porcelain').toString().trim();
if (status) {
  console.log('Stashing uncommitted changes...');
  run('git stash push -m "Automatic stash before syncing with dev"');
  stashNeeded = true;
}

// Update dev branch
console.log('Updating local dev branch with remote...');
run('git checkout dev');
run('git pull origin dev');

// Go back to the original branch
console.log(`Switching back to ${currentBranch}...`);
run(`git checkout ${currentBranch}`);

// Merge dev into current branch
console.log(`Merging dev into ${currentBranch}...`);
run('git merge dev --no-edit');

// Pop the stash if needed
if (stashNeeded) {
  console.log('Applying stashed changes...');
  run('git stash pop');
}

console.log(`Successfully synced ${currentBranch} with dev branch.`);