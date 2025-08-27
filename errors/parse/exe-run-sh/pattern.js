export const pattern = {
  name: 'exe-run-sh',
  
  test(error, ctx) {
    // Check if this is an /exe error with "run sh" in the line
    return error.message && 
           error.message.includes('Invalid /exe syntax') &&
           ctx.line && 
           ctx.line.includes('/exe') && 
           ctx.line.includes('run sh');
  },
  
  enhance(error, ctx) {
    // Extract the function name if possible
    const funcMatch = ctx.line.match(/@(\w+)\s*\(/);
    const funcName = funcMatch ? funcMatch[1] : 'func';
    
    return {
      FUNCNAME: funcName,
      LINE: ctx.line.trim()
    };
  }
};