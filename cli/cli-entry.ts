import 'reflect-metadata';
import { main } from './index.js';

// Export the main function for programmatic use
export { main };

// Run main if this is the entry point
if (require.main === module) {
  // Parse arguments
  const args = process.argv.slice(2);

  // Call the main function from index.ts, passing only customArgs
  main(args).catch(err => {
    // Basic error handling for the entry point
    console.error('CLI Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
} 