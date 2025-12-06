#!/usr/bin/env node

import { main } from '../cli/index';
import { cliLogger as logger } from '@core/utils/logger';

// Store the original console.error
const originalConsoleError = console.error;

// Keep track of error messages we've seen
const seenErrors = new Set<string>();

// Replace console.error with our custom implementation
console.error = function(...args: any[]) {
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

// Run CLI
const args = process.argv.slice(2);
const hasWatchFlag = args.includes('--watch') || args.includes('-w');

main(args)
  .then(async () => {
    if (!hasWatchFlag) {
      // Prevent lingering handles (formatters, shadow env timers) from keeping the process alive
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(0);
    }
  })
  .catch((error: Error) => {
    process.exit(1);
  }); 
