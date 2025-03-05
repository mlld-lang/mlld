#!/usr/bin/env node

/**
 * This script helps bump the version in package.json
 * Usage: node scripts/bump-version.js <patch|minor|major>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the type of version bump from command line args
const args = process.argv.slice(2);
const validTypes = ['patch', 'minor', 'major'];
const bumpType = args[0] || 'patch';

if (!validTypes.includes(bumpType)) {
  console.error(`Error: Version bump type must be one of: ${validTypes.join(', ')}`);
  process.exit(1);
}

// Read the package.json file
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Parse version components
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Calculate new version based on bump type
let newVersion;
if (bumpType === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (bumpType === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else { // patch
  newVersion = `${major}.${minor}.${patch + 1}`;
}

// Update package.json with new version
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Bumped version from ${currentVersion} to ${newVersion} (${bumpType})`);

// Stage the change
try {
  execSync('git add package.json', { stdio: 'inherit' });
  console.log('Staged package.json');
  
  // Suggest commit command
  console.log('\nTo commit this change:');
  console.log(`git commit -m "Bump version to ${newVersion}"`);
  
  // Suggest prepare-main command
  console.log('\nAfter merging to dev, update main with:');
  console.log('npm run prepare-main');
} catch (error) {
  console.error('Error staging package.json:', error.message);
}