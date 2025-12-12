#!/usr/bin/env node

/**
 * Version bumping script for the Mlld project
 * Usage: 
 *   node scripts/bump-version.js [patch|minor|major]
 * 
 * If no argument is provided, it defaults to patch.
 */

const fs = require('fs');
const path = require('path');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Get the version type from command line arguments
const versionType = process.argv[2] || 'patch';
const validTypes = ['patch', 'minor', 'major'];

if (!validTypes.includes(versionType)) {
  console.error(`Error: Version type must be one of ${validTypes.join(', ')}`);
  process.exit(1);
}

// Read the package.json file
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.error('Error reading package.json:', error.message);
  process.exit(1);
}

// Parse the current version
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Calculate the new version based on the version type
let newVersion;
switch (versionType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Update the version in package.json
packageJson.version = newVersion;

// Write the updated package.json back to disk
try {
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Version bumped from ${currentVersion} to ${newVersion}`);

  // Sync VSCode extension version
  const vscodePackageJsonPath = path.join(__dirname, '..', 'editors', 'vscode', 'package.json');
  try {
    const vscodePackageJson = JSON.parse(fs.readFileSync(vscodePackageJsonPath, 'utf8'));
    vscodePackageJson.version = newVersion;
    fs.writeFileSync(vscodePackageJsonPath, JSON.stringify(vscodePackageJson, null, 2) + '\n');
    console.log(`VSCode extension version synced to ${newVersion}`);
  } catch (error) {
    console.error('Warning: Could not sync VSCode extension version:', error.message);
  }

  // Also sync mlldx version
  const { execSync } = require('child_process');
  console.log('\nSyncing mlldx version...');
  execSync('npm run sync:mlldx', { stdio: 'inherit' });
} catch (error) {
  console.error('Error writing package.json:', error.message);
  process.exit(1);
}

// Log a reminder about publishing
console.log('\nRemember to:');
console.log('1. Commit the changes: git commit -am "Bump version to ' + newVersion + '"');
console.log('2. Create a tag: git tag v' + newVersion);
console.log('3. Push changes: git push && git push --tags');
console.log('4. Publish to npm if needed: npm publish'); 