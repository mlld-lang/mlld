#!/usr/bin/env node

/**
 * CLI Test Script
 * 
 * This script runs the CLI with error deduplication to ensure
 * no duplicate error messages are displayed.
 */

// Store the original console.error
const originalConsoleError = console.error;

// Keep track of error messages we've seen
const seenErrors = new Set();

// Replace console.error with our custom implementation
console.error = function(...args) {
  // Convert the arguments to a string for comparison
  const errorMsg = args.join(' ');
  
  // If we've seen this error before, don't print it
  if (seenErrors.has(errorMsg)) {
    return;
  }
  
  // Add this error to the set of seen errors
  seenErrors.add(errorMsg);
  
  // Call the original console.error
  originalConsoleError.apply(console, args);
};

// Get the arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/test-cli.js <input-file> [options]');
  console.error('Example: node scripts/test-cli.js examples/example.meld');
  process.exit(1);
}

// Run the CLI
try {
  require('../dist/cli.cjs');
} catch (error) {
  // This is just to prevent the script from crashing
  console.error('Test script error:', error);
  process.exit(1);
} 