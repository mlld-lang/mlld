/**
 * Direct test script for field access
 * This script doesn't rely on importing TypeScript files
 */

// Test object
const person = {
  name: "John Doe",
  age: 30,
  occupation: "Developer",
  address: {
    street: "123 Main St",
    city: "Anytown",
    state: "CA",
    zip: "12345"
  }
};

// Simple field access function
function resolveFieldAccess(obj, fieldPath) {
  console.log('Input:', { obj, fieldPath });
  
  // Handle empty field path
  if (!fieldPath || fieldPath.length === 0) {
    console.log('Empty field path, returning original object');
    return obj;
  }
  
  // Traverse the object via the field path
  let current = obj;
  for (const field of fieldPath) {
    console.log(`Accessing field: ${field}`);
    
    if (current === null || current === undefined) {
      console.log('Cannot access field of null/undefined');
      throw new Error(`Cannot access field ${field} of undefined or null`);
    }
    
    // Normal property access
    if (typeof current !== 'object' || !(field in current)) {
      console.log(`Field ${field} not found in object:`, current);
      throw new Error(`Cannot access field ${field} of ${typeof current}`);
    }
    
    current = current[field];
    console.log(`Field value:`, current);
  }
  
  console.log('Final result:', current);
  return current;
}

// Simulate the resolveSimpleVariables method
function resolveSimpleVariables(text, variables) {
  console.log('Input text:', text);
  console.log('Available variables:', variables);
  
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
    
    // Handle field access in variable names (e.g., "data.user.name")
    const parts = varRef.split('.');
    const baseVar = parts[0];
    
    console.log('Variable parts:', { parts, baseVar });
    
    // Get the variable value
    let value = variables[baseVar];
    
    if (value === undefined) {
      throw new Error(`Undefined variable: ${baseVar}`);
    }
    
    console.log('Base variable value:', value);
    
    // For data variables with field access, resolve fields
    if (parts.length > 1 && typeof value === 'object' && value !== null) {
      try {
        // Store the original object for comparison
        const originalObject = value;
        
        // Attempt to resolve the field access
        value = resolveFieldAccess(value, parts.slice(1));
        
        // Check if the field access actually changed the value
        if (value === originalObject) {
          console.warn(`Field access may not have worked correctly for ${parts.join('.')}`);
        }
      } catch (error) {
        throw new Error(`Failed to access field ${parts.slice(1).join('.')} in ${baseVar}: ${error.message}`);
      }
    }
    
    // Stringification logic - key part of the fix
    let stringValue;
    
    if (typeof value === 'object' && value !== null) {
      if (parts.length === 1) {
        // We're not doing field access, stringify the whole object
        console.log('Stringifying whole object');
        stringValue = JSON.stringify(value);
      } else {
        // We were doing field access - only stringify if the result is still an object
        console.log('Field access result handling');
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
    
    // Replace the variable in the text
    result = result.replace(fullMatch, stringValue);
    console.log('After replacement:', result);
  }
  
  return result;
}

// Test cases
function runTests() {
  // Available variables
  const variables = {
    person: person,
    simple_text: "Hello, world!"
  };
  
  console.log('=== TEST 1: Simple field access ===');
  try {
    const result = resolveFieldAccess(person, ['name']);
    console.log('Test 1 result:', result);
  } catch (error) {
    console.error('Test 1 error:', error.message);
  }
  
  console.log('\n=== TEST 2: Nested field access ===');
  try {
    const result = resolveFieldAccess(person, ['address', 'city']);
    console.log('Test 2 result:', result);
  } catch (error) {
    console.error('Test 2 error:', error.message);
  }
  
  console.log('\n=== TEST 3: Variable resolution with field access ===');
  try {
    const text = "Testing person.name: {{person.name}}";
    const result = resolveSimpleVariables(text, variables);
    console.log('Test 3 result:', result);
    console.log('Contains marker:', result.includes('FIX_APPLIED_'));
  } catch (error) {
    console.error('Test 3 error:', error.message);
  }
  
  console.log('\n=== TEST 4: Variable resolution without field access ===');
  try {
    const text = "Person object: {{person}}";
    const result = resolveSimpleVariables(text, variables);
    console.log('Test 4 result:', result);
  } catch (error) {
    console.error('Test 4 error:', error.message);
  }
  
  console.log('\n=== TEST 5: Simple text variable ===');
  try {
    const text = "Simple text variable: {{simple_text}}";
    const result = resolveSimpleVariables(text, variables);
    console.log('Test 5 result:', result);
  } catch (error) {
    console.error('Test 5 error:', error.message);
  }
}

// Run the tests
runTests(); 