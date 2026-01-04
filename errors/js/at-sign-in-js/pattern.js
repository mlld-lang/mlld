export const pattern = {
  name: 'at-sign-in-js',
  
  test(error, mx) {
    // Check if this is a JS syntax error with @ symbol
    const message = error.message || '';
    const isUnexpectedToken = message.includes('Invalid or unexpected token') || message.includes('Unexpected token');
    if (!isUnexpectedToken) {
      return false;
    }

    // Check if the code contains @ symbol (mlld variable syntax)
    if (!mx.code || !mx.code.includes('@')) {
      return false;
    }
    
    // Look for @variable pattern in the code
    return /@\w+/.test(mx.code);
  },
  
  enhance(error, mx) {
    // Extract the variable name after @
    const varMatch = mx.code.match(/@(\w+)/);
    const varName = varMatch ? varMatch[1] : 'variable';
    
    // Find the specific @ usage context - get the line with @
    const lines = mx.code.split('\n');
    let usage = '';
    for (const line of lines) {
      if (line.includes('@')) {
        usage = line.trim();
        break;
      }
    }
    
    if (usage.length > 50) {
      usage = usage.substring(0, 47) + '...';
    }
    
    return {
      VARNAME: varName,
      USAGE: usage
    };
  }
};
