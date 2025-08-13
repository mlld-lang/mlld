export const pattern = {
  name: 'at-sign-in-js',
  
  test(error, ctx) {
    // Check if this is a JS syntax error with @ symbol
    if (!error.message || !error.message.includes('Invalid or unexpected token')) {
      return false;
    }
    
    // Check if the code contains @ symbol (mlld variable syntax)
    if (!ctx.code || !ctx.code.includes('@')) {
      return false;
    }
    
    // Look for @variable pattern in the code
    return /@\w+/.test(ctx.code);
  },
  
  enhance(error, ctx) {
    // Extract the variable name after @
    const varMatch = ctx.code.match(/@(\w+)/);
    const varName = varMatch ? varMatch[1] : 'variable';
    
    // Find the specific @ usage context - get the line with @
    const lines = ctx.code.split('\n');
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