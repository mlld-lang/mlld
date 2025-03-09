import 'reflect-metadata';
import { main } from './index.js';

// Export the main function for programmatic use
export { main };

// Run main if this is the entry point
if (require.main === module) {
  // Pass process.argv.slice(2) to main for proper argument handling
  main(undefined, process.argv.slice(2)).catch(err => {
    // The error should already be logged in the main function
    process.exit(1);
  });
} 