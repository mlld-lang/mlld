#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';

// Check if we should build syntax files
function shouldBuildSyntax() {
  // Check environment variables
  if (process.env.SKIP_SYNTAX_BUILD === 'true') {
    console.log('Skipping syntax build (SKIP_SYNTAX_BUILD=true)');
    return false;
  }
  
  if (process.env.FORCE_SYNTAX_BUILD === 'true') {
    console.log('Forcing syntax build (FORCE_SYNTAX_BUILD=true)');
    return true;
  }
  
  // Check if running in CI
  if (process.env.CI === 'true') {
    // Only build on main branch in CI
    const branch = process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || '';
    if (branch === 'main') {
      console.log('Building syntax files for main branch in CI');
      return true;
    } else {
      console.log(`Skipping syntax build for branch: ${branch}`);
      return false;
    }
  }
  
  // Check if running in GitHub Actions
  if (process.env.GITHUB_ACTIONS === 'true') {
    const eventName = process.env.GITHUB_EVENT_NAME || '';
    const ref = process.env.GITHUB_REF || '';
    
    // Build on push to main or release
    if (eventName === 'push' && (ref === 'refs/heads/main' || ref.startsWith('refs/tags/'))) {
      console.log('Building syntax files for main branch or release');
      return true;
    }
    
    // Skip for pull requests and other branches
    console.log(`Skipping syntax build for event: ${eventName}, ref: ${ref}`);
    return false;
  }
  
  // For local development, check if generated files exist in editors/
  const editorsDir = new URL('../../editors', import.meta.url).pathname;
  const checkFiles = [
    `${editorsDir}/web/prism-mlld.js`,
    `${editorsDir}/textmate/mlld.tmLanguage.json`,
    `${editorsDir}/vim/syntax/mlld.vim`
  ];

  const allExist = checkFiles.every(f => fs.existsSync(f));
  if (allExist) {
    console.log('Syntax files already exist, skipping regeneration');
    console.log('Run with FORCE_SYNTAX_BUILD=true to regenerate');
    return false;
  }

  // If generated files missing, build them
  console.log('Some syntax files missing, generating...');
  return true;
}

// Main execution
if (shouldBuildSyntax()) {
  try {
    // Run the actual build script
    execSync('node grammar/syntax-generator/build-syntax.js', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
  } catch (error) {
    console.error('Error building syntax files:', error.message);
    process.exit(1);
  }
} else {
  console.log('Syntax build skipped');
}