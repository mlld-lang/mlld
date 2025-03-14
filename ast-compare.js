// Script to compare AST structures between text variable and data variable field access
const fs = require('fs');
const { parse } = require('./dist/parser.js');

// Define the two test files
const textVariableContent = '@text variable = "Hello world"\n@embed {{variable}}';
const dataVariableContent = '@data role = { "architect": "Senior architect" }\n@embed {{role.architect}}';

// Write the test files
fs.writeFileSync('text-var-test.meld', textVariableContent);
fs.writeFileSync('data-var-test.meld', dataVariableContent);

// Parse both files
try {
  console.log('Parsing text variable embed:');
  const textAst = parse(textVariableContent);
  console.log(JSON.stringify(textAst, null, 2));
  
  console.log('\n\nParsing data variable with field access:');
  const dataAst = parse(dataVariableContent);
  console.log(JSON.stringify(dataAst, null, 2));
} catch (error) {
  console.error('Error parsing:', error);
}