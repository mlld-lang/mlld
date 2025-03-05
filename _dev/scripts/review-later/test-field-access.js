#!/usr/bin/env node

/**
 * Test script for field access using the improved variable resolution approach
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create a temporary test file
const testFilePath = path.join(__dirname, 'test-field-access.meld');
const testContent = `
# Field Access Test

@data person = {
  name: "John Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown"
  }
}

@text greeting = "Hello, world!"

{{greeting}}

Direct object access: {{person}}

Field access: 
- Name: {{person.name}}
- Age: {{person.age}}
- Street: {{person.address.street}}
- City: {{person.address.city}}
`;

try {
  console.log("Creating test file:", testFilePath);
  fs.writeFileSync(testFilePath, testContent);

  // Process using the direct processing approach
  console.log("\nRunning with direct-process.js (our custom implementation):");
  try {
    // First try our direct process.js implementation
    const directOutput = execSync(`node ${__dirname}/direct-process.js ${testFilePath}`, {
      encoding: 'utf8'
    });
    console.log("\nDIRECT PROCESS OUTPUT:");
    console.log(directOutput);
  } catch (error) {
    console.error("Error running direct-process.js:", error.message);
  }

  // Also run with the standard processor using our improvements
  console.log("\nRunning with standard process-meld.js:");
  try {
    const standardOutput = execSync(`node scripts/process-meld.js ${testFilePath} --format=markdown`, {
      encoding: 'utf8'
    });
    console.log("\nSTANDARD PROCESS OUTPUT:");
    console.log(standardOutput);
  } catch (error) {
    console.error("Error running process-meld.js:", error.message);
  }
} finally {
  // Clean up the temporary file
  if (fs.existsSync(testFilePath)) {
    console.log("Cleaning up temporary file");
    fs.unlinkSync(testFilePath);
  }
} 