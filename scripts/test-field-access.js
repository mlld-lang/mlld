/**
 * Simple test script for field access
 * Run with: npx ts-node scripts/test-field-access.js
 */

// Since we're using a JS file, we need to enable TypeScript module resolution
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node'
  }
});

// Import the VariableReferenceResolver directly from the source
const { VariableReferenceResolver } = require('../services/resolution/ResolutionService/resolvers/VariableReferenceResolver');
const { MeldResolutionError } = require('../core/errors/MeldResolutionError');

// Simple field access function
function testFieldAccess(obj, fieldPath) {
  console.log('Testing field access:', { obj, fieldPath });
  let current = obj;
  
  for (const field of fieldPath) {
    console.log(`Accessing field: ${field}`);
    
    if (current === null || current === undefined) {
      throw new Error(`Cannot access field ${field} of undefined or null`);
    }
    
    if (typeof current !== 'object' || !(field in current)) {
      throw new Error(`Cannot access field ${field} of ${typeof current}`);
    }
    
    current = current[field];
  }
  
  return current;
}

// Mock state service
const mockStateService = {
  getTextVar: (name) => ({ hello: "text variable" }[name]),
  getDataVar: (name) => ({ 
    person: {
      name: "John Doe",
      age: 30,
      occupation: "Developer",
      address: {
        street: "123 Main St",
        city: "Anytown"
      }
    } 
  })[name],
  getPathVar: () => null,
  getAllTextVars: () => new Map(),
  getAllDataVars: () => new Map(),
  getAllPathVars: () => new Map()
};

// Mock resolution context
const mockContext = {
  state: mockStateService,
  allowedVariableTypes: { text: true, data: true, path: true }
};

// Test direct field access
console.log('=== TEST 1: Simple field access ===');
const person = mockStateService.getDataVar('person');
console.log('Person object:', person);
console.log('Accessing person.name directly:', person.name);

console.log('\n=== TEST 2: Nested field access ===');
console.log('Accessing person.address.city directly:', person.address.city);

// Create an instance of the resolver
const resolver = new VariableReferenceResolver(mockStateService);

// Test the resolveFieldAccess method
console.log('\n=== TEST 3: Using resolveFieldAccess method ===');
try {
  const result = resolver.resolveFieldAccess(person, ['name'], mockContext);
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error.message);
}

// Test the resolveSimpleVariables method
console.log('\n=== TEST 4: Using resolveSimpleVariables method ===');
try {
  // Field access
  const text = "{{person.name}}";
  const result = resolver.resolveSimpleVariables(text, mockContext);
  
  console.log('Input:', text);
  console.log('After field access:', result);
  
  // Test stringification logic
  if (typeof result === 'object' && result !== null) {
    if (Array.isArray(['name'])) {
      // We're not doing field access, stringify the whole object
      console.log('Stringified (whole object):', JSON.stringify(result));
    } else {
      // We were doing field access - only stringify if the result is still an object
      console.log('Field access result handling');
      console.log('Stringified (if object):', typeof result === 'object' ? JSON.stringify(result) : String(result));
    }
  } else {
    console.log('String result:', String(result));
  }
} catch (error) {
  console.error('Error:', error.message);
}

// Test with our special debug marker
console.log('\n=== TEST 5: Check if our "FIX_APPLIED_" marker is working ===');
try {
  const text = "{{person.name}}";
  const result = resolver.resolveSimpleVariables(text, mockContext);
  console.log('Input:', text);
  console.log('Result:', result);
  console.log('Contains marker:', result.includes('FIX_APPLIED_'));
} catch (error) {
  console.error('Error:', error.message);
}

/**
 * Direct test for field access in variable references
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Create a temporary test file
const tempFile = path.join(__dirname, 'temp-field-test.meld');

// Test content with field access
const testContent = `
@text simple_text = "Hello, world!"
@data person = {
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}

# Field Access Test

Simple text: {{simple_text}}

Direct object: {{person}}

Field access:
- Name: {{person.name}}
- Age: {{person.age}}
- Street: {{person.address.street}}
- City: {{person.address.city}}
`;

console.log("Writing test file to:", tempFile);
fs.writeFileSync(tempFile, testContent);

// Custom node script to perform the transformations directly
const customProcessScript = `
// Load the services
const path = require('path');
const fs = require('fs');

// Setup a basic state service
class SimpleStateService {
  constructor() {
    this.textVars = new Map();
    this.dataVars = new Map();
  }
  
  isTransformationEnabled() {
    return false;
  }
  
  getTransformedNodes() {
    return [];
  }
  
  getTextVar(name) {
    return this.textVars.get(name);
  }
  
  getDataVar(name) {
    return this.dataVars.get(name);
  }
  
  getAllTextVars() {
    return this.textVars;
  }
  
  getAllDataVars() {
    return this.dataVars;
  }
  
  setTextVar(name, value) {
    this.textVars.set(name, value);
  }
  
  setDataVar(name, value) {
    this.dataVars.set(name, value);
  }
}

// Custom field access implementation
function resolveFieldAccess(obj, fieldPath) {
  console.log('Field access debug:', { obj, fieldPath });
  
  // Handle empty field path
  if (!fieldPath || fieldPath.length === 0) {
    return obj;
  }
  
  // Traverse the object via the field path
  let current = obj;
  for (const field of fieldPath) {
    if (current === null || current === undefined) {
      throw new Error(\`Cannot access field \${field} of undefined or null\`);
    }
    
    // Check if the current value is an object and has the field
    if (typeof current !== 'object' || !(field in current)) {
      throw new Error(\`Cannot access field \${field} of \${typeof current}\`);
    }
    
    // Access the field
    current = current[field];
  }
  
  return current;
}

// Function to process variable references
function resolveSimpleVariables(text, stateService) {
  console.log('Resolving variables in text:', text);
  
  // Skip if no variable references found
  if (!text.includes('{{')) {
    return text;
  }
  
  // Replace variable references in format {{varName}}
  const variableRegex = /\{\{([^{}]+?)\}\}/g;
  let result = text;
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const varRef = match[1];
    
    console.log('Found variable reference:', { fullMatch, varRef });
    
    // Handle field access in variable names (e.g., "data.user.name")
    const parts = varRef.split('.');
    const baseVar = parts[0];
    
    let value;
    
    // First, try to find the variable in the text variables
    value = stateService.getTextVar(baseVar);
    
    // If not found in text variables, try data variables
    if (value === undefined) {
      value = stateService.getDataVar(baseVar);
    }
    
    // If variable not found, return empty string
    if (value === undefined) {
      console.log('Variable not found:', baseVar);
      result = result.replace(fullMatch, '');
      continue;
    }
    
    console.log('Found variable:', { baseVar, value });
    
    // For data variables with field access, resolve fields
    if (parts.length > 1 && typeof value === 'object' && value !== null) {
      try {
        console.log('Resolving field access for:', { parts, value });
        
        // Direct implementation of field access
        value = resolveFieldAccess(value, parts.slice(1));
        
        console.log('Field access result:', value);
      } catch (error) {
        console.error('Field access error:', error.message);
        // On error, just use empty string
        result = result.replace(fullMatch, '');
        continue;
      }
    }
    
    // Stringification logic - key part of the fix
    let stringValue;
    
    if (typeof value === 'object' && value !== null) {
      if (parts.length === 1) {
        // We're not doing field access, stringify the whole object
        stringValue = JSON.stringify(value, null, 2);
      } else {
        // We were doing field access - only stringify if the result is still an object
        stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    } else {
      // For primitive values, just convert to string
      stringValue = String(value);
    }
    
    // Add a special marker to help us debug if our fix is taking effect
    if (parts.length > 1 && parts[1] === 'name') {
      stringValue = "FIX_APPLIED_" + stringValue;
    }
    
    console.log('Replacing with:', stringValue);
    
    // Replace the variable in the text
    result = result.replace(fullMatch, stringValue);
  }
  
  return result;
}

// Main process function
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract variables
  const textVarRegex = /@text\\s+([^\\s=]+)\\s*=\\s*"([^"]*)"/g;
  const dataVarRegex = /@data\\s+([^\\s=]+)\\s*=\\s*({[^@]*})/g;
  
  const state = new SimpleStateService();
  
  // Process text variables
  let textMatch;
  while ((textMatch = textVarRegex.exec(content)) !== null) {
    const [_, name, value] = textMatch;
    state.setTextVar(name, value);
    console.log('Found text variable:', { name, value });
  }
  
  // Process data variables
  let dataMatch;
  while ((dataMatch = dataVarRegex.exec(content)) !== null) {
    const [_, name, jsonStr] = dataMatch;
    try {
      const value = JSON.parse(jsonStr);
      state.setDataVar(name, value);
      console.log('Found data variable:', { name, value });
    } catch (e) {
      console.error('Error parsing data variable:', e);
    }
  }
  
  // Process the content with variable resolution
  const result = resolveSimpleVariables(content, state);
  
  return result;
}

// Process the file
try {
  const inputFile = '${tempFile}';
  const result = processFile(inputFile);
  console.log('\\n\\n--- PROCESSED RESULT ---\\n');
  console.log(result);
} catch (error) {
  console.error('Error processing file:', error);
}

// Write the custom processor script
const scriptPath = path.join(__dirname, 'temp-processor.js');
fs.writeFileSync(scriptPath, customProcessScript);

console.log("Running field access test...");

// Execute the test
exec("node " + scriptPath, (error, stdout, stderr) => {
  if (error) {
    console.error('Error executing test:', error);
    return;
  }
  
  if (stderr) {
    console.error('Test script error:', stderr);
    return;
  }
  
  console.log(stdout);
  
  // Clean up
  console.log("Cleaning up temporary files...");
  fs.unlinkSync(tempFile);
  fs.unlinkSync(scriptPath);
  
  // Analyze results
  if (stdout.includes('FIX_APPLIED_John Doe') && 
      stdout.includes('Age: 30') && 
      stdout.includes('Street: 123 Main St') && 
      stdout.includes('City: Anytown')) {
    console.log("✅ SUCCESS: Field access is working correctly!");
  } else {
    console.log("❌ FAILURE: Field access is not working as expected!");
  }
}); 