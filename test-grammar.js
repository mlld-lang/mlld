// Simple script to test the grammar directly
const parser = require('./core/ast/grammar/parser.cjs');

try {
  // Test text directive with nested directive
  const textResult = parser.parse('@text myvar = @embed "file.txt"');
  console.log('Text directive with nested directive:');
  console.log(JSON.stringify(textResult[0], null, 2));
  
  // Test data directive with nested directive
  const dataResult = parser.parse('@data myconfig = @embed "config.json"');
  console.log('\nData directive with nested directive:');
  console.log(JSON.stringify(dataResult[0], null, 2));
  
  // Test import directive
  const importResult = parser.parse('@import { * } from "file.md"');
  console.log('\nImport directive:');
  console.log(JSON.stringify(importResult[0], null, 2));
} catch (error) {
  console.error('Parser error:', error);
}