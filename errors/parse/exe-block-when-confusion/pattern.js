export const pattern = {
  name: 'exe-block-when-confusion',
  
  test(error, mx) {
    // Check if error is about shell redirection in an /exe context
    if (!error.message || !error.message.includes('Shell redirection operators')) {
      return false;
    }
    
    // Check if we're in an /exe context
    if (!mx.line.includes('/exe')) {
      return false;
    }
    
    // Look for /when in the next few lines (the block content)
    // Note: mx.lineNumber is 1-based, array is 0-based
    if (mx.lines && mx.lineNumber < mx.lines.length) {
      // Start from current line (the /exe line) and look ahead
      const startIdx = mx.lineNumber - 1;
      const endIdx = Math.min(startIdx + 6, mx.lines.length);
      const nextFewLines = mx.lines.slice(startIdx, endIdx);
      
      // Check if any line has /when (suggesting when expression confusion)
      return nextFewLines.some(line => line && line.trim().includes('/when'));
    }
    
    return false;
  },
  
  enhance(error, mx) {
    // Extract the exe function name and parameters
    const exeMatch = mx.line.match(/\/exe\s+@(\w+)\((.*?)\)/);
    const funcName = exeMatch ? exeMatch[1] : 'myFunc';
    const params = exeMatch ? exeMatch[2] : '';
    
    // Look for /when in the next few lines to understand intent
    const nextLines = mx.lines.slice(mx.lineNumber, mx.lineNumber + 5);
    const hasWhenBlock = nextLines.some(line => line && line.includes('/when'));
    
    // Build a suggested correction
    let suggestion = '';
    if (hasWhenBlock) {
      suggestion = `/exe @${funcName}(${params}) = when [
  @condition => action
  * => default
]`;
    }
    
    return {
      FUNC: funcName,
      PARAMS: params,
      SUGGESTION: suggestion
    };
  }
};