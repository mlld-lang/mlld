export const pattern = {
  name: 'for-block-syntax',
  
  test(error, mx) {
    // Check if error is about invalid /var syntax and line contains for loop with block
    if (error.message && error.message.includes('Invalid /var syntax')) {
      // Look for "for @var in" followed by "=> {"
      return mx.line && mx.line.match(/for\s+@\w+\s+in.*=>\s*\{/);
    }
    return false;
  },
  
  enhance(error, mx) {
    // Extract the loop variable name if possible
    const match = mx.line.match(/for\s+@(\w+)/);
    const loopVar = match ? match[1] : 'item';
    
    return {
      LOOP_VAR: loopVar
    };
  }
};