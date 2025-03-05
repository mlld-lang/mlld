// Debug script for testing nested object access
import fs from 'fs';
import path from 'path';
import { main } from '../dist/api/index.js';
import { NodeFileSystem } from '../dist/api/fs/NodeFileSystem.js';

async function debugNestedAccess() {
  try {
    console.log('Starting nested object access debug test');
    
    // Create a test file with nested object structure
    const testContent = `@data nested = {
  "users": [
    { 
      "name": "Alice", 
      "hobbies": ["reading", "hiking"] 
    },
    { 
      "name": "Bob", 
      "hobbies": ["gaming", "cooking"] 
    }
  ]
}

Name: {{nested.users.0.name}}
Hobby: {{nested.users.0.hobbies.0}}`;

    // Write test file
    const testFilePath = 'test-nested.meld';
    fs.writeFileSync(testFilePath, testContent);
    console.log(`Created test file: ${testFilePath}`);
    
    // Run the transformation
    console.log('Running transformation...');
    const result = await main(testFilePath, {
      fs: new NodeFileSystem(),
      transformation: true
    });
    
    console.log('\nTransformation Result:');
    console.log('---------------------');
    console.log(result);
    console.log('---------------------');
    
    // Check if transformation was successful
    const expectedOutput = 'Name: Alice\nHobby: reading';
    if (result.trim() === expectedOutput) {
      console.log('\n✅ Transformation successful!');
    } else {
      console.log('\n❌ Transformation failed!');
      console.log(`Expected: "${expectedOutput}"`);
      console.log(`Actual: "${result.trim()}"`);
    }
    
    // Clean up
    fs.unlinkSync(testFilePath);
    console.log(`Removed test file: ${testFilePath}`);
  } catch (error) {
    console.error('Error during debug test:', error);
  }
}

// Run the debug function
debugNestedAccess(); 