/**
 * Test script for testing field access without requiring a build
 */
const fs = require('fs');
const { createLLMXML } = require('llmxml'); 

// Sample JSON object
const person = {
  name: "John Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown",
    zip: "12345"
  },
  hobbies: ["reading", "hiking", "coding"]
};

// Create a test markdown document with field access examples
const markdown = `
# Field Access Test

Direct object: ${JSON.stringify(person, null, 2)}

Field access:
- Name: ${person.name}
- Age: ${person.age}
- Street: ${person.address.street}
- City: ${person.address.city}
- First hobby: ${person.hobbies[0]}

Here's the names: {"first": "Alice", "last": "Smith"}
`;

console.log("Original markdown:");
console.log(markdown);
console.log("\n--------------------------------------------------\n");

// Main async function to handle promises
async function runTest() {
  try {
    // Create LLMXML instance
    const llmxml = createLLMXML({
      defaultFuzzyThreshold: 0.7,
      includeHlevel: false,
      includeTitle: false,
      tagFormat: 'PascalCase',
      verbose: false,
      warningLevel: 'all'
    });
    
    // Convert to XML (await the Promise)
    const xml = await llmxml.toXML(markdown);
    
    console.log("Converted to LLMXML:");
    console.log(xml);
    console.log("\n--------------------------------------------------\n");
    
    // Look for entity-encoded JSON
    console.log("HTML entity check:");
    if (xml.includes('&quot;')) {
      console.log("✓ HTML entities found in output - this will be fixed when the llmxml library is updated");
    } else {
      console.log("❌ No HTML entities found - unexpected");
    }
  } catch (error) {
    console.error("Error in test:", error);
  }
}

// Run the async test
runTest(); 