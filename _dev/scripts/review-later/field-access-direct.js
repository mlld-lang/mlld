/**
 * Simple direct test for field access functionality
 */

// Sample data
const person = {
  name: 'John Doe',
  age: 30,
  address: {
    street: '123 Main St',
    city: 'Anytown'
  }
};

/**
 * Custom field access implementation
 */
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
      throw new Error(`Cannot access field ${field} of undefined or null`);
    }
    
    // Check if the current value is an object and has the field
    if (typeof current !== 'object' || !(field in current)) {
      throw new Error(`Cannot access field ${field} of ${typeof current}`);
    }
    
    // Access the field
    current = current[field];
  }
  
  return current;
}

/**
 * Resolve simple variables with field access
 */
function resolveSimpleVariables(text, variables) {
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
    
    let value = variables[baseVar];
    
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
      stringValue = 'FIX_APPLIED_' + stringValue;
    }
    
    console.log('Replacing with:', stringValue);
    
    // Replace the variable in the text
    result = result.replace(fullMatch, stringValue);
  }
  
  return result;
}

// Variables for testing
const variables = {
  person: person,
  greeting: 'Hello, world!'
};

// Test cases
const tests = [
  'Simple text: {{greeting}}',
  'Direct object: {{person}}',
  'Name: {{person.name}}',
  'Age: {{person.age}}',
  'Street: {{person.address.street}}',
  'City: {{person.address.city}}'
];

// Run tests
console.log('=== FIELD ACCESS TESTS ===');
tests.forEach((test, index) => {
  console.log(`\n----- Test ${index + 1}: ${test} -----`);
  const result = resolveSimpleVariables(test, variables);
  console.log(`Result: ${result}`);
});

// Test if our stringification fix is working correctly
const fieldAccessTest = 'Direct: {{person}} vs Field: {{person.name}}';
console.log('\n----- Stringification Test -----');
const stringResult = resolveSimpleVariables(fieldAccessTest, variables);
console.log(`Result: ${stringResult}`);

// Summarize results
console.log('\n=== TEST SUMMARY ===');
const fieldTest = resolveSimpleVariables('{{person.name}}', variables);
if (fieldTest.includes('FIX_APPLIED_John Doe')) {
  console.log('✅ SUCCESS: Field access is working correctly!');
} else {
  console.log('❌ FAILURE: Field access is not working as expected!');
} 