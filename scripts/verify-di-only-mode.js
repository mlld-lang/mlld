#!/usr/bin/env node
/**
 * Verify DI-Only Mode Compatibility
 * 
 * This script runs tests with MIGRATE_TO_DI_ONLY=true to verify they work in DI-only mode.
 * It's part of the TSyringe migration project to help track which tests are ready for DI-only mode.
 * 
 * Usage:
 *   node scripts/verify-di-only-mode.js <test-file-paths>
 * 
 * Examples:
 *   node scripts/verify-di-only-mode.js services/fs/FileSystemService/FileSystemService.test.ts
 *   node scripts/verify-di-only-mode.js services/fs/FileSystemService/*.test.ts
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Run a specific test file with DI-only mode
function runTestWithDIOnly(testFile) {
  console.log(`${colors.bright}Running ${colors.cyan}${testFile}${colors.reset} with DI-only mode...`);
  
  try {
    // Set environment variable for DI-only mode
    process.env.MIGRATE_TO_DI_ONLY = 'true';
    
    // Run the test using npm test
    execSync(`npm test ${testFile}`, { stdio: 'inherit' });
    
    console.log(`${colors.green}✅ ${testFile} passed in DI-only mode!${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}❌ ${testFile} failed in DI-only mode:${colors.reset}`, error.message);
    return false;
  } finally {
    // Clean up environment variable
    delete process.env.MIGRATE_TO_DI_ONLY;
  }
}

// Save results to tracking file
function saveResults(results) {
  const trackingDir = path.join(__dirname, '..', '_dev', 'issues', 'features', 'tsyringe', 'tracking');
  
  // Create tracking directory if it doesn't exist
  if (!fs.existsSync(trackingDir)) {
    fs.mkdirSync(trackingDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = path.join(trackingDir, `di-only-results-${timestamp}.json`);
  
  fs.writeFileSync(
    fileName, 
    JSON.stringify(results, null, 2)
  );
  
  console.log(`${colors.blue}Results saved to: ${fileName}${colors.reset}`);
  
  // Also update the summary file
  updateSummaryFile(results);
}

// Update the summary tracking file
function updateSummaryFile(results) {
  const trackingDir = path.join(__dirname, '..', '_dev', 'issues', 'features', 'tsyringe', 'tracking');
  const summaryFile = path.join(trackingDir, 'di-compatibility-summary.md');
  
  // Read existing summary if it exists
  let summaryContent = '';
  if (fs.existsSync(summaryFile)) {
    summaryContent = fs.readFileSync(summaryFile, 'utf8');
  } else {
    // Create initial summary content
    summaryContent = `# DI-Only Mode Compatibility Summary
    
This file tracks which tests are compatible with DI-only mode. It is automatically updated by the verify-di-only-mode.js script.

## Test Status

| Test File | Status | Last Checked |
|-----------|--------|--------------|
`;
  }
  
  // Get the current date
  const date = new Date().toISOString().split('T')[0];
  
  // Update each test result in the summary
  for (const result of results) {
    const status = result.passed ? '✅ Pass' : '❌ Fail';
    const testFileLine = `| ${result.file} | ${status} | ${date} |`;
    
    // Check if the test is already in the summary
    if (summaryContent.includes(`| ${result.file} |`)) {
      // Replace the existing line
      const regex = new RegExp(`\\| ${result.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*\\|.*\\|`);
      summaryContent = summaryContent.replace(regex, testFileLine);
    } else {
      // Add a new line
      summaryContent += testFileLine + '\n';
    }
  }
  
  // Write updated summary
  fs.writeFileSync(summaryFile, summaryContent);
  console.log(`${colors.blue}Summary updated: ${summaryFile}${colors.reset}`);
}

// Main function
function main() {
  // Test files to verify
  const testFiles = process.argv.slice(2);

  if (testFiles.length === 0) {
    console.log(`
${colors.bright}${colors.yellow}Verify DI-Only Mode Compatibility${colors.reset}

This script runs tests with MIGRATE_TO_DI_ONLY=true to verify they work in DI-only mode.
It's part of the TSyringe migration project to help track which tests are ready for DI-only mode.

${colors.bright}Usage:${colors.reset}
  node scripts/verify-di-only-mode.js <test-file-paths>

${colors.bright}Examples:${colors.reset}
  node scripts/verify-di-only-mode.js services/fs/FileSystemService/FileSystemService.test.ts
  node scripts/verify-di-only-mode.js "services/fs/**/*.test.ts"
`);
    process.exit(1);
  }

  console.log(`${colors.bright}${colors.yellow}DI-Only Mode Verification${colors.reset}`);
  console.log(`${colors.dim}Running ${testFiles.length} test files...${colors.reset}\n`);

  // Run each test file and collect results
  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const file of testFiles) {
    const passed = runTestWithDIOnly(file);
    passed ? passCount++ : failCount++;
    
    results.push({
      file,
      passed,
      timestamp: new Date().toISOString()
    });
  }

  console.log(`\n${colors.bright}${colors.yellow}Results:${colors.reset} ${colors.green}${passCount} passed${colors.reset}, ${colors.red}${failCount} failed${colors.reset}`);
  
  // Save results for tracking
  saveResults(results);
  
  // Exit with appropriate code
  process.exit(failCount > 0 ? 1 : 0);
}

// Run the main function
main();