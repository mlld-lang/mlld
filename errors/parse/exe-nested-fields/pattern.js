export const pattern = {
  name: 'exe-nested-fields',
  
  test(error, mx) {
    // The parser expects = but finds . after /exe @identifier
    // Or it may show generic /exe syntax error
    return (
      mx.line.match(/^\/exe\s+@\w+\./) &&
      (error.expected?.some(e => e.text === '=') || 
       error.message?.includes('Invalid /exe syntax'))
    );
  },
  
  enhance(error, mx) {
    // Extract the attempted nested field declaration
    const match = mx.line.match(/^\/exe\s+@(\w+)((?:\.\w+)+)(\([^)]*\))?/);
    const baseVar = match?.[1] || 'object';
    const fields = match?.[2] || '.method';
    const params = match?.[3] || '()';
    
    // Extract just the method name (last field)
    const fieldParts = fields.slice(1).split('.');
    const methodName = fieldParts[fieldParts.length - 1];
    
    // Return variables for template interpolation
    return {
      baseVar,
      fields,
      params,
      methodName
    };
  }
};