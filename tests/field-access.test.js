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
  // Create a temporary test file
  const testFilePath = path.join(__dirname, 'test-field-access.meld');
  
  before(() => {
    // Create a test file with data variables and field access
    const testContent = `
@text greeting = "Hello, world!"
@data person = {
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}
@data names = [
  {"first": "Alice", "last": "Smith"},
  {"first": "Bob", "last": "Jones"}
]

# Test Output

{{greeting}}

Direct object access: {{person}}

Field access: 
- Name: {{person.name}}
- Age: {{person.age}}
- Street: {{person.address.street}}
- City: {{person.address.city}}

Array access:
- First person: {{names.0}}
- First person's first name: {{names.0.first}}
- Second person's last name: {{names.1.last}}
`;

    fs.writeFileSync(testFilePath, testContent);
  });
  
  after(() => {
    // Clean up the test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });
  
  it('should properly serialize JSON objects and access fields', () => {
    // Run the meld processor on the test file
    const result = execSync(`node scripts/process-meld.js ${testFilePath}`).toString();
    
    // Verify the output contains the greeting
    assert.ok(result.includes('Hello, world!'), 'Output should include the greeting');
    
    // Verify direct object access produces proper JSON (not HTML-escaped)
    assert.ok(result.includes('"name":"John Doe"'), 'Output should include properly formatted JSON for direct object access');
    assert.ok(!result.includes('&quot;'), 'Output should not HTML-escape quotes in JSON');
    
    // Verify field access works correctly
    assert.ok(result.includes('Name: John Doe'), 'Field access should extract the name correctly');
    assert.ok(result.includes('Age: 30'), 'Field access should extract the age correctly');
    assert.ok(result.includes('Street: 123 Main St'), 'Nested field access should extract the street correctly');
    assert.ok(result.includes('City: Anytown'), 'Nested field access should extract the city correctly');
    
    // Verify array access works correctly
    assert.ok(result.includes('"first":"Alice"'), 'Array access should work correctly');
    assert.ok(result.includes('First person\'s first name: Alice'), 'Array field access should extract the first name correctly');
    assert.ok(result.includes('Second person\'s last name: Jones'), 'Array field access should extract the last name correctly');
  });
  
  it('should work with our custom processor script', () => {
    // Run the custom processor script on the test file
    const result = execSync(`node scripts/custom-process.js ${testFilePath}`).toString();
    
    // Verify the output contains the greeting
    assert.ok(result.includes('Hello, world!'), 'Output should include the greeting');
    
    // Verify direct object access produces proper JSON (not HTML-escaped)
    assert.ok(result.includes('"name":"John Doe"'), 'Output should include properly formatted JSON for direct object access');
    assert.ok(!result.includes('&quot;'), 'Output should not HTML-escape quotes in JSON');
    
    // Verify field access works correctly (with our fix marker)
    assert.ok(result.includes('Name: FIX_APPLIED_John Doe'), 'Field access should extract the name correctly with our fix marker');
    assert.ok(result.includes('Age: 30'), 'Field access should extract the age correctly');
    assert.ok(result.includes('Street: 123 Main St'), 'Nested field access should extract the street correctly');
    assert.ok(result.includes('City: Anytown'), 'Nested field access should extract the city correctly');
  });
}); 