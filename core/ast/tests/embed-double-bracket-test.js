// Simple test for @embed with double brackets and variable references
import * as parser from '@core/ast';

const DEBUG = true;

// Override console.log to clearly show debug messages
const originalLog = console.log;
console.log = (...args) => {
  originalLog('\x1b[36m[DEBUG TEST]\x1b[0m', ...args);
};

// Parse a test string with variable references in double brackets
const testString = `
@embed [[
    This text should highlight differently than {{this.variable}} or 
    $thisPathVariable. 
]]
`;

// Turn on debugging in parser
// This requires temporarily modifying the parser to expose the DEBUG flag
process.env.MELD_DEBUG = 'true';

console.log('Parsing test string:', testString);
try {
  const result = parser.parse(testString);
  console.log('Parsing successful!');
  console.log('AST result:', JSON.stringify(result, null, 2));
  
  // Check if the first node is a directive and if it has warnings
  if (result[0] && result[0].type === 'Directive') {
    if (result[0].warnings) {
      console.log('WARNING DETECTED:', result[0].warnings);
    } else {
      console.log('No warnings detected, which is good!');
    }
    
    // Check if the content is preserved correctly
    if (result[0].directive && result[0].directive.content) {
      console.log('Content preserved correctly:', result[0].directive.content);
    }
  }
} catch (err) {
  console.error('Parsing failed:', err);
}