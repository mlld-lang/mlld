export const pattern = {
  name: 'action-in-exe-when',
  
  test(error, mx) {
    // Check if we're in an /exe definition with when
    if (!mx.line.match(/^\s*\/exe\s+@\w+.*=\s*when/)) {
      // Check previous lines for exe when pattern
      for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 10); i--) {
        if (mx.lines[i] && mx.lines[i].match(/^\s*\/exe\s+@\w+.*=\s*when/)) {
          // We're inside an exe when block, check for action directives
          return mx.line.match(/=>\s*\/\w+/) !== null;
        }
      }
      return false;
    }
    
    // Check if the line has an action (directive starting with /)
    return mx.line.match(/=>\s*\/\w+/) !== null;
  },
  
  enhance(error, mx) {
    // Extract the action being used
    const actionMatch = mx.line.match(/=>\s*\/(\w+)/);
    const action = actionMatch ? actionMatch[1] : 'show';
    
    // Extract the function name if visible
    let funcName = 'function';
    for (let i = mx.lineNumber - 1; i >= Math.max(0, mx.lineNumber - 10); i--) {
      const funcMatch = mx.lines[i].match(/\/exe\s+@(\w+)/);
      if (funcMatch) {
        funcName = funcMatch[1];
        break;
      }
    }
    
    return {
      ACTION: action,
      FUNCNAME: funcName,
      LINE: mx.lineNumber
    };
  }
};