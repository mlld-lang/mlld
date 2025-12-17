export const pattern = {
  name: 'var-with-parens',
  
  test(error, mx) {
    // Check if this is a /var directive with parentheses (trying to define a function)
    // The error typically occurs when parsing expects '=' but finds '(' after a variable name
    return mx.line.startsWith('/var') && 
           mx.line.includes('(') && 
           error.message.includes("Expected '='");
  },
  
  enhance(error, mx) {
    // Extract the attempted function name
    const match = mx.line.match(/@(\w+)\s*\(/);
    const functionName = match ? match[1] : 'function';
    
    // Extract the full attempted definition for context
    const attemptedDefinition = mx.line.trim();
    
    return {
      FUNCTION_NAME: functionName,
      ATTEMPTED_LINE: attemptedDefinition,
      CORRECT_SYNTAX: attemptedDefinition.replace('/var', '/exe')
    };
  }
};

