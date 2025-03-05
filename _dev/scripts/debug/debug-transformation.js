import { main } from '../api/index.js';
import path from 'path';
import fs from 'fs';

// Create a simple test file
const testContent = `@text greeting = "Hello World"
{{greeting}}`;

const testFilePath = path.join(process.cwd(), 'test-debug.meld');
fs.writeFileSync(testFilePath, testContent);

console.log('Testing with transformation enabled:');
main(testFilePath, {
  transformation: true
}).then(result => {
  console.log('Result:', result);
  console.log('Contains "Hello World":', result.includes('Hello World'));
  console.log('Contains "{{greeting}}":', result.includes('{{greeting}}'));
}).catch(error => {
  console.error('Error:', error);
});

// Clean up after test
// fs.unlinkSync(testFilePath); 