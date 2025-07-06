/**
 * Main entry point for the Mlld CLI application.
 */
/// <reference types="node" />
import { main } from './index';

// Export the main function for programmatic use
export { main };

// Run main if this is the entry point
// In ESM, we check if this file was run directly
// Note: This is a workaround since we're compiling to CJS
const isMainModule = true; // Always run when this file is executed

if (isMainModule) {
  // Parse arguments
  const args = process.argv.slice(2);

  // Call the main function from index.ts, passing only customArgs
  // The main function handles its own errors through CLIOrchestrator -> ErrorHandler
  main(args);
} 