#!/usr/bin/env node

/**
 * This script syncs the dev branch with main
 * It should be used when main (the clean, public branch) has been updated separately and we want
 * to bring those changes into dev (the full development branch)
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

// Save current branch
console.log("Stashing any uncommitted changes...");
let stashNeeded = false;
const status = execSync('git status --porcelain').toString().trim();
if (status) {
  console.log("Stashing uncommitted changes...");
  run('git stash push -m "Automatic stash before syncing main to dev"');
  stashNeeded = true;
}

// Fetch latest changes
console.log("Fetching latest changes...");
run('git fetch origin');

// Update main branch
console.log("Updating local main branch with remote...");
run('git checkout main');
run('git pull origin main');

// Update dev branch
console.log("Updating dev branch from main...");
run('git checkout dev');
run('git pull origin dev');
run('git merge main --no-edit');

// Push to remote
console.log("Pushing updated dev branch to remote...");
run('git push origin dev');

// Go back to original branch
if (currentBranch !== 'dev') {
  console.log(`Switching back to ${currentBranch}...`);
  run(`git checkout ${currentBranch}`);
  
  // Pop the stash if needed
  if (stashNeeded) {
    console.log("Applying stashed changes...");
    run('git stash pop');
  }
}

console.log("Successfully synced main to dev branch.");