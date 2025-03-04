#!/usr/bin/env node

console.log('Loading reflect-metadata...');
// Ensure reflect-metadata is loaded before tsyringe
require('reflect-metadata');

console.log('Loading CLI...');
// Disable error deduplication by setting global flag
global.MELD_DISABLE_ERROR_DEDUPLICATION = true;

// Capture unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Capture uncaught exceptions
process.on('uncaughtException', (error) => {
  console.log('Uncaught Exception:', error);
});

try {
  console.log('Requiring CLI...');
  // Now load the CLI
  const cli = require('../dist/cli.cjs');
  console.log('CLI loaded. Available exports:', Object.keys(cli));
  
  if (cli.main) {
    console.log('Calling main function...');
    cli.main().catch(error => {
      console.log('Error in main function:', error);
    });
  } else {
    console.log('No main function found in exports');
  }
} catch (error) {
  console.log('Error loading CLI:', error);
} 