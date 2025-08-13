export const pattern = {
  name: 'for-block-syntax',
  
  test(error, ctx) {
    // Check if error is about invalid /var syntax and line contains for loop with block
    if (error.message && error.message.includes('Invalid /var syntax')) {
      // Look for "for @var in" followed by "=> {"
      return ctx.line && ctx.line.match(/for\s+@\w+\s+in.*=>\s*\{/);
    }
    return false;
  },
  
  enhance(error, ctx) {
    // Extract the loop variable name if possible
    const match = ctx.line.match(/for\s+@(\w+)/);
    const loopVar = match ? match[1] : 'item';
    
    return {
      LOOP_VAR: loopVar
    };
  }
};