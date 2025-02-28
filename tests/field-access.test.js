/**
 * Tests for field access functionality in Meld
 * 
 * This test verifies that:
 * 1. Data objects are properly serialized as JSON when accessed directly
 * 2. Fields of data objects are properly accessed and returned as text
 * 3. JSON is not HTML-escaped in the output
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

describe('Field Access Tests', () => {
  it('should properly serialize JSON objects and access fields using native processor', () => {
    // Create a temp test file
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

    fs.writeFileSync(testFilePath, testContent);

    try {
      // Run the direct processor script which handles field access correctly
      const output = execSync(`node scripts/direct-process.js ${testFilePath}`, {
        encoding: 'utf8'
      });
      
      console.log("\n=== ACTUAL OUTPUT CONTENT ===");
      console.log(output);
      console.log("===========================\n");
      
      // Verify the output contains the greeting
      assert.ok(output.includes('Hello, world!'), 'Output should include the greeting');
      
      // Verify direct object access produces proper JSON (not HTML-escaped)
      assert.ok(
        output.includes('"name"') && output.includes('John Doe'), 
        'Output should include person name in JSON format'
      );
      assert.ok(!output.includes('&quot;'), 'Output should not HTML-escape quotes in JSON');
      
      // Verify field access works correctly
      assert.ok(output.includes('Name: John Doe'), 'Field access should extract the name correctly');
      assert.ok(output.includes('Age: 30'), 'Field access should extract the age correctly');
      assert.ok(output.includes('Street: 123 Main St'), 'Nested field access should extract the street correctly');
      assert.ok(output.includes('City: Anytown'), 'Nested field access should extract the city correctly');
    } finally {
      // Clean up the temp file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });
}); 