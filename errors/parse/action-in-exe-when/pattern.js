export const pattern = {
  name: 'action-in-exe-when',
  
  test(error, ctx) {
    // Check if we're in an /exe definition with when
    if (!ctx.line.match(/^\s*\/exe\s+@\w+.*=\s*when/)) {
      // Check previous lines for exe when pattern
      for (let i = ctx.lineNumber - 2; i >= Math.max(0, ctx.lineNumber - 10); i--) {
        if (ctx.lines[i] && ctx.lines[i].match(/^\s*\/exe\s+@\w+.*=\s*when/)) {
          // We're inside an exe when block, check for action directives
          return ctx.line.match(/=>\s*\/\w+/) !== null;
        }
      }
      return false;
    }
    
    // Check if the line has an action (directive starting with /)
    return ctx.line.match(/=>\s*\/\w+/) !== null;
  },
  
  enhance(error, ctx) {
    // Extract the action being used
    const actionMatch = ctx.line.match(/=>\s*\/(\w+)/);
    const action = actionMatch ? actionMatch[1] : 'show';
    
    // Extract the function name if visible
    let funcName = 'function';
    for (let i = ctx.lineNumber - 1; i >= Math.max(0, ctx.lineNumber - 10); i--) {
      const funcMatch = ctx.lines[i].match(/\/exe\s+@(\w+)/);
      if (funcMatch) {
        funcName = funcMatch[1];
        break;
      }
    }
    
    return {
      ACTION: action,
      FUNCNAME: funcName,
      LINE: ctx.lineNumber
    };
  }
};