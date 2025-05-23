// Quick trace to see if CLI is called multiple times
const originalLog = console.log;
let callCount = 0;

console.log = function(...args) {
  if (typeof args[0] === 'string' && args[0].includes('Hello')) {
    callCount++;
    originalLog(`[Call ${callCount}]`, ...args);
  } else {
    originalLog(...args);
  }
};

// Run the CLI
require('./dist/cli.cjs');