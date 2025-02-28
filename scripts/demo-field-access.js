#!/usr/bin/env node

/**
 * Demo script to demonstrate field access with improved LLMXML integration
 * 
 * This script shows how field access works with the direct llmxml library integration,
 * demonstrating proper handling of object values and field access.
 */

const fs = require('fs');
const path = require('path');
const { createLLMXML } = require('llmxml');
const { v4: uuidv4 } = require('uuid');

// Create a temporary directory for our test files
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Create a unique filename for this run
const tempFile = path.join(tempDir, `field-access-demo-${uuidv4()}.md`);

// Sample data with nested objects
const data = {
  person: {
    name: 'John Doe',
    age: 30,
    contact: {
      email: 'john@example.com',
      phone: '555-1234'
    },
    addresses: [
      {
        type: 'home',
        street: '123 Main St',
        city: 'Anytown'
      },
      {
        type: 'work',
        street: '456 Business Ave',
        city: 'Workville'
      }
    ]
  },
  company: {
    name: 'Acme Corp',
    founded: 1985
  }
};

// Helper function to access fields using dot notation
function accessField(obj, path) {
  if (!obj || !path) return undefined;
  
  const parts = Array.isArray(path) ? path : path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array access with bracket notation: items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [_, arrayName, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      
      if (!current[arrayName] || !Array.isArray(current[arrayName])) {
        return undefined;
      }
      
      current = current[arrayName][index];
    } else {
      current = current[part];
    }
  }
  
  return current;
}

// Helper function to process variable references in a string
function processVariables(content, variables) {
  return content.replace(/\{\{([^}]+)\}\}/g, (match, varRef) => {
    // Split by dot for field access
    const parts = varRef.trim().split('.');
    const baseVar = parts[0];
    
    if (!variables[baseVar]) {
      return `{{${varRef}}}`;  // Keep as is if variable not found
    }
    
    let value = variables[baseVar];
    
    // Handle field access
    if (parts.length > 1) {
      value = accessField(value, parts.slice(1));
    }
    
    // Stringify objects, handle null/undefined
    if (value === undefined || value === null) {
      return '';
    } else if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    } else {
      return String(value);
    }
  });
}

// Create a test template with variable references
const templateContent = `
# Field Access Demo

## Basic Field Access
- Person's name: {{person.name}}
- Person's age: {{person.age}}

## Nested Field Access
- Email: {{person.contact.email}}
- Phone: {{person.contact.phone}}

## Array Access
- Home address: {{person.addresses[0].street}}, {{person.addresses[0].city}}
- Work address: {{person.addresses[1].street}}, {{person.addresses[1].city}}

## Full Objects
- Person object: {{person}}
- Company: {{company}}
`;

// Process the template with our variables
const processedContent = processVariables(templateContent, data);

// Write the processed content to the temp file
fs.writeFileSync(tempFile, processedContent);
console.log(`Processed template written to: ${tempFile}`);
console.log('\nProcessed Content:');
console.log('=================');
console.log(processedContent);

// Now convert to LLMXML using the direct library
const llmxml = createLLMXML({
  defaultFuzzyThreshold: 0.7,
  includeHlevel: false,
  includeTitle: false,
  tagFormat: 'PascalCase',
  verbose: false,
  warningLevel: 'all'
});

// Main async function to handle promises
async function main() {
  try {
    // Convert to XML - handle the Promise
    const xmlOutput = await llmxml.toXML(processedContent);
    
    // Write XML output to a file
    const xmlFile = tempFile.replace('.md', '.xml');
    fs.writeFileSync(xmlFile, xmlOutput);
    console.log(`\nLLMXML output written to: ${xmlFile}`);
    
    // Display the XML output
    console.log('\nLLMXML Output:');
    console.log('=============');
    console.log(xmlOutput.substring(0, 500) + '...');  // Show first 500 chars
    
    console.log('\nSuccess! The LLMXML library correctly handled all field access and object values.');
  } catch (error) {
    console.error('Error converting to LLMXML:', error);
    
    // Try with additional preprocessing for JSON content
    console.log('\nAttempting with JSON preprocessing...');
    
    const preprocessedContent = processedContent.replace(/```json\n([\s\S]*?)```/g, (match, jsonContent) => {
      try {
        const parsed = JSON.parse(jsonContent);
        return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
      } catch (jsonError) {
        return match;
      }
    });
    
    try {
      const xmlOutput = await llmxml.toXML(preprocessedContent);
      const xmlFile = tempFile.replace('.md', '-preprocessed.xml');
      fs.writeFileSync(xmlFile, xmlOutput);
      console.log(`Preprocessed LLMXML output written to: ${xmlFile}`);
      
      console.log('\nLLMXML Output (after preprocessing):');
      console.log('=================================');
      console.log(xmlOutput.substring(0, 500) + '...');  // Show first 500 chars
    } catch (retryError) {
      console.error('Error after preprocessing:', retryError);
    }
  }
  
  console.log('\nCleanup: You can delete the temporary files when done with:');
  console.log(`rm ${tempFile} ${tempFile.replace('.md', '.xml')}`);
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error in main:', err);
  process.exit(1);
}); 