export const pattern = {
  name: 'exe-run-sh',
  
  test(error, mx) {
    // Check if this is an /exe error with "run sh" in the line
    return error.message && 
           error.message.includes('Invalid /exe syntax') &&
           mx.line && 
           mx.line.includes('/exe') && 
           mx.line.includes('run sh');
  },
  
  enhance(error, mx) {
    // Extract the function name if possible
    const funcMatch = mx.line.match(/@(\w+)\s*\(/);
    const funcName = funcMatch ? funcMatch[1] : 'func';
    
    return {
      FUNCNAME: funcName,
      LINE: mx.line.trim()
    };
  }
};