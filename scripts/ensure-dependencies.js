#!/usr/bin/env node

/**
 * This script ensures that necessary dependencies are installed
 * when the package is installed globally.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// List of dependencies to check and install if needed
const criticalDependencies = [
  'reflect-metadata',
  'fs-extra'
];

// Try to check if a module can be loaded
function canLoadModule(moduleName) {
  try {
    require.resolve(moduleName);
    return true;
  } catch (e) {
    return false;
  }
}

// Install a package globally
function installPackage(packageName) {
  console.log(`Installing ${packageName} globally...`);
  
  try {
    // Check if we have permission to install globally
    const npmConfigOutput = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
    
    // Try to write to a test file in the global node_modules directory
    const testPath = path.join(npmConfigOutput, 'node_modules', '.meld-test');
    
    try {
      fs.writeFileSync(testPath, 'test');
      fs.unlinkSync(testPath);
      
      // We have permission, install globally
      execSync(`npm install -g ${packageName}`, { 
        stdio: 'inherit'
      });
    } catch (error) {
      // No permission, suggest using sudo or other approaches
      console.log(`\nCannot install ${packageName} globally without higher privileges.`);
      console.log('Please run one of the following commands:');
      console.log(`\n  sudo npm install -g ${packageName}`);
      console.log('  or');
      console.log(`  npm install -g ${packageName} --prefix ~/.npm-global`);
      console.log('\nAlternatively, add this to your .npmrc file:');
      console.log('  prefix=~/.npm-global');
      console.log('\nAnd make sure ~/.npm-global/bin is in your PATH.');
      
      process.exit(1);
    }
  } catch (error) {
    console.error(`Failed to install ${packageName}:`, error.message);
    process.exit(1);
  }
}

// Main function
function ensureDependenciesExist() {
  console.log('Checking for required dependencies...');
  
  for (const dependency of criticalDependencies) {
    if (!canLoadModule(dependency)) {
      console.log(`Missing dependency: ${dependency}`);
      installPackage(dependency);
    } else {
      console.log(`✓ Found ${dependency}`);
    }
  }
  
  console.log('All dependencies are available!');
}

// Run the function
ensureDependenciesExist(); 
