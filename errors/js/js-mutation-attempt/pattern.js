export const pattern = {
  name: 'js-mutation-attempt',
  
  test(error, mx) {
    // Check for syntax error in JS context
    if (!error.message || !error.message.includes('Invalid or unexpected token')) {
      return false;
    }
    
    if (!mx.code) {
      return false;
    }
    
    // Look for mutation patterns like @var++ or @var += 
    const mutationPatterns = [
      /@\w+\+\+/,        // @var++
      /@\w+--/,          // @var--
      /@\w+\s*\+=/,      // @var +=
      /@\w+\s*-=/,       // @var -=
      /@\w+\s*\*=/,      // @var *=
      /@\w+\s*\/=/       // @var /=
    ];
    
    return mutationPatterns.some(pattern => pattern.test(mx.code));
  },
  
  enhance(error, mx) {
    // Extract the variable and operation
    const varMatch = mx.code.match(/@(\w+)(\+\+|--|[+\-*/]=)/);
    const varName = varMatch ? varMatch[1] : 'variable';
    const operation = varMatch ? varMatch[2] : '++';
    
    // Determine the suggested fix
    let suggestion = `return ${varName} + 1`;
    if (operation === '--') {
      suggestion = `return ${varName} - 1`;
    } else if (operation.includes('=')) {
      const op = operation[0];
      suggestion = `return ${varName} ${op} value`;
    }
    
    return {
      VARNAME: varName,
      OPERATION: operation,
      SUGGESTION: suggestion
    };
  }
};