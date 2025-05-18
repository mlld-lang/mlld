// Simple, focused test script for debugging the variable-based add transformation issue

// Import basic required modules
const fs = require('fs');
const path = require('path');
const { main } = require('../api/index.js');

// Sample content with variable-based add
const testContent = `
@data role = {
  "architect": "Senior architect skilled in TypeScript"
}

@add {{role.architect}}
`;

// File path for test
const testFilePath = path.join(__dirname, 'add-var-test.meld');

async function runTest() {
  console.log('STARTING TEST SCRIPT');
  console.log('Creating test file');
  
  // Create test file
  fs.writeFileSync(testFilePath, testContent);
  
  console.log('Testing with transformation mode');
  
  try {
    // Run transformation
    const result = await main(testFilePath, {
      transformation: true,
      format: 'md'
    });
    
    console.log('Result:', result);
    console.log('Result type:', typeof result);
    console.log('Result length:', result.length);
    console.log('Contains add directive?', result.includes('@add'));
    console.log('Contains variable reference?', result.includes('{{role.architect}}'));
    console.log('Contains expected value?', result.includes('Senior architect'));
    
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    // Clean up
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// Run the test
runTest().catch(err => {
  console.error('Unhandled error:', err);
});