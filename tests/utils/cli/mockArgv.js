/**
 * Temporarily replaces process.argv with the provided arguments
 * 
 * @param {string[]} args - The arguments to set
 * @returns {Function} A function to restore the original process.argv
 */
export function mockArgv(args) {
  const originalArgv = process.argv;
  process.argv = args;
  
  return function restore() {
    process.argv = originalArgv;
  };
} 