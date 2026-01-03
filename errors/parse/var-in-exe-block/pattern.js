export const pattern = {
  name: 'var-in-exe-block',

  test(error, mx) {
    // Check if line starts with "var" (possibly with leading whitespace)
    if (!mx.line.match(/^\s*var\s+@/)) {
      return false;
    }

    // Check if we're inside an exe block by looking for /exe in previous lines
    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i];
      if (!prevLine) continue;

      // Found exe block start
      if (prevLine.match(/\/exe\s+@\w+.*=\s*\[/)) {
        return true;
      }

      // Found exe block with when
      if (prevLine.match(/\/exe\s+@\w+.*=\s*when/)) {
        return true;
      }

      // If we hit another directive that isn't exe, we're probably not in an exe block
      if (prevLine.match(/^\s*\/(?!exe)\w+/)) {
        return false;
      }
    }

    return false;
  },

  enhance(error, mx) {
    // Extract the variable name being defined
    const varMatch = mx.line.match(/var\s+@(\w+)/);
    const varName = varMatch ? varMatch[1] : 'x';

    // Extract the function name if visible
    let funcName = 'myFunc';
    for (let i = mx.lineNumber - 1; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const funcMatch = mx.lines[i]?.match(/\/exe\s+@(\w+)/);
      if (funcMatch) {
        funcName = funcMatch[1];
        break;
      }
    }

    return {
      VARNAME: varName,
      FUNCNAME: funcName,
      LINE: mx.lineNumber
    };
  }
};
