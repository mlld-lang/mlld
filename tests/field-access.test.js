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
      // Run the meld processor with our changes applied
      const output = execSync(`node scripts/process-meld.js ${testFilePath} --format=markdown`, {
        encoding: 'utf8'
      });
      
      console.log("\n=== ACTUAL OUTPUT CONTENT ===");
      console.log(output);
      console.log("===========================\n");
      
      // Create a better visualization of what's being output
      console.log("First 1000 characters as JSON string to see non-printable chars:");
      console.log(JSON.stringify(output.substring(0, 1000)));
      
      // Check if the output contains {{person.name}} - if so, the variable wasn't resolved
      console.log("\nDoes output still contain unresolved variable references?");
      console.log("- Contains {{person.name}}:", output.includes('{{person.name}}'));
      console.log("- Contains {{person.age}}:", output.includes('{{person.age}}'));
      console.log("- Contains {{person.address.street}}:", output.includes('{{person.address.street}}'));
      
      // Check if expected resolved strings are present
      console.log("\nDoes output contain expected resolved values?");
      console.log("- Contains 'Name: John Doe':", output.includes('Name: John Doe'));
      console.log("- Contains 'Age: 30':", output.includes('Age: 30'));
      console.log("- Contains 'Street: 123 Main St':", output.includes('Street: 123 Main St'));
      
      // Visualize field access sections
      const nameLocation = output.indexOf('Name:');
      if (nameLocation !== -1) {
        console.log("\nName field context (20 chars before and after):");
        console.log(output.substring(Math.max(0, nameLocation - 20), nameLocation + 20));
      } else {
        console.log("\nName field not found in output");
      }
      
      // Look for person field JSON
      const personLocation = output.indexOf('Direct object access:');
      if (personLocation !== -1) {
        console.log("\nPerson object context (everything after 'Direct object access:'):");
        console.log(output.substring(personLocation, personLocation + 300));
      }
      
      // Verify the output contains the greeting
      assert.ok(output.includes('Hello, world!'), 'Output should include the greeting');
      
      // Verify direct object access produces proper JSON (not HTML-escaped)
      // Accept either "name":"John Doe" or "name": "John Doe" format
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