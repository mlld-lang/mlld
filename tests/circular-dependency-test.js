/**
 * Standalone test for circular import detection
 * 
 * This script directly tests the circular import detection using the same
 * files that are used in the e2e tests.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Add pretty logging
const log = (message, data = null) => {
  const prefix = '\x1b[36m[CircularityTest]\x1b[0m';
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

const error = (message, data = null) => {
  const prefix = '\x1b[31m[CircularityTest Error]\x1b[0m';
  if (data) {
    console.error(`${prefix} ${message}`, data);
  } else {
    console.error(`${prefix} ${message}`);
  }
};

// Files to test
const circularImportA = path.resolve(__dirname, 'cases/invalid/circular-import.error.mld');
const circularImportB = path.resolve(__dirname, 'cases/invalid/circular-import-b.error.mld');

// Run a test with timeout to catch hanging processes
function runWithTimeout(command, timeoutMs = 5000) {
  log(`Running command with ${timeoutMs}ms timeout: ${command}`);
  
  try {
    const start = Date.now();
    const result = execSync(command, { 
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const end = Date.now();
    
    log(`Command completed in ${end - start}ms`);
    return { success: true, output: result, time: end - start };
  } catch (err) {
    if (err.signal === 'SIGTERM') {
      error(`Command timed out after ${timeoutMs}ms`);
      return { success: false, error: 'TIMEOUT', time: timeoutMs };
    } else {
      error(`Command failed: ${err.message}`);
      // If stderr contains circular import message, that's expected and good
      if (err.stderr && err.stderr.includes('Circular import')) {
        log(`Detected circular import error (expected): ${err.stderr.trim()}`);
        return { success: true, output: err.stderr, time: 0 };
      }
      return { success: false, error: err, time: 0 };
    }
  }
}

// Test with CircularityService debug enabled
process.env.DEBUG = 'true';

// 1. Check if files exist
log('Checking test files existence...');
if (!fs.existsSync(circularImportA)) {
  error(`File not found: ${circularImportA}`);
  process.exit(1);
}
if (!fs.existsSync(circularImportB)) {
  error(`File not found: ${circularImportB}`);
  process.exit(1);
}

log('Test files exist:', { 
  fileA: circularImportA, 
  fileB: circularImportB 
});

// 2. Test importing file A (should detect circular import)
log('Testing import of file A (should detect circular import)...');
const resultA = runWithTimeout(`node bin/meld-wrapper.js ${circularImportA}`);

// 3. Test importing file B (should detect circular import)
log('Testing import of file B (should detect circular import)...');
const resultB = runWithTimeout(`node bin/meld-wrapper.js ${circularImportB}`);

// 4. Summary
log('Test results summary:');
log(`File A test: ${resultA.success ? 'SUCCESS' : 'FAILED'}`, resultA);
log(`File B test: ${resultB.success ? 'SUCCESS' : 'FAILED'}`, resultB);

if (!resultA.success || !resultB.success) {
  error('Circular import detection test failed. The circular import is not being detected.');
  process.exit(1);
} else {
  log('All tests passed. Circular import detection is working correctly.');
  process.exit(0);
}