#!/usr/bin/env node

/**
 * Syncs the mlldx package version with the main mlld package
 * and optionally publishes it
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --provenance only works in CI (GitHub Actions)
const provenance = process.env.GITHUB_ACTIONS ? '--provenance' : '';

// Read the main package.json
const mainPackagePath = path.join(__dirname, '..', 'package.json');
const mainPackage = JSON.parse(fs.readFileSync(mainPackagePath, 'utf8'));

// Path to mlldx package
const mlldxPackagePath = path.join(__dirname, '..', 'mlldx-package', 'package.json');

// Check if mlldx package exists
if (!fs.existsSync(mlldxPackagePath)) {
  console.error('mlldx package not found at:', mlldxPackagePath);
  process.exit(1);
}

// Read mlldx package.json
const mlldxPackage = JSON.parse(fs.readFileSync(mlldxPackagePath, 'utf8'));

// Update version and mlld dependency
mlldxPackage.version = mainPackage.version;
mlldxPackage.dependencies.mlld = `^${mainPackage.version}`;

// Write updated package.json
fs.writeFileSync(mlldxPackagePath, JSON.stringify(mlldxPackage, null, 2) + '\n');

console.log(`✅ Updated mlldx package to version ${mainPackage.version}`);
console.log(`✅ Updated mlld dependency to ^${mainPackage.version}`);

// Check if we should publish
const shouldPublish = process.argv.includes('--publish');

// Get the tag from command line arguments
const tagIndex = process.argv.indexOf('--tag');
const tagFromArgs = tagIndex !== -1 && process.argv[tagIndex + 1] ? process.argv[tagIndex + 1] : null;

if (shouldPublish) {
  console.log('\n📦 Publishing mlldx package...');
  
  try {
    // Change to mlldx directory
    const mlldxDir = path.dirname(mlldxPackagePath);
    
    // Check if version already exists
    try {
      const npmInfo = execSync(`npm view mlldx@${mainPackage.version}`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr
      });
      
      if (npmInfo) {
        console.log(`⚠️  Version ${mainPackage.version} already published, skipping...`);
        process.exit(0);
      }
    } catch (e) {
      // Version doesn't exist, we can publish
    }
    
    // Use the tag from command line if provided, otherwise determine based on version
    let tag;
    if (tagFromArgs) {
      tag = tagFromArgs;
    } else {
      const isPrerelease = mainPackage.version.includes('-');
      tag = isPrerelease ? 'next' : 'latest';
    }
    
    execSync(`npm publish --tag ${tag} ${provenance}`.trim(), {
      cwd: mlldxDir,
      stdio: 'inherit'
    });
    
    console.log(`✅ Published mlldx@${mainPackage.version} with tag '${tag}'`);
  } catch (error) {
    console.error('❌ Failed to publish mlldx:', error.message);
    process.exit(1);
  }
}