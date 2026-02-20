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
  const args = process.argv.slice(2);
  const hasWatchFlag = args.includes('--watch') || args.includes('-w');

  (async () => {
    try {
      await main(args);
      if (!hasWatchFlag) {
        // Allow output to flush before exit; skip in watch mode
        await new Promise(resolve => setTimeout(resolve, 10));
        process.exit(0);
      }
    } catch (error) {
      console.error(error);
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(1);
    }
  })();
} 
