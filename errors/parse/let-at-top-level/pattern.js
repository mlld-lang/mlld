export const pattern = {
  name: 'let-at-top-level',

  test(error, mx) {
    // Check if this is a strict mode text error
    if (!error.message?.includes('Text content not allowed in strict mode')) {
      return false;
    }

    // Check if line starts with "let @" (top-level let declaration)
    if (!mx.line.match(/^\s*let\s+@/)) {
      return false;
    }

    // Ensure we're NOT inside a block (exe, for, etc.)
    // If we're inside a block, the grammar would parse it correctly
    // This error only occurs at top level in strict mode
    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i];
      if (!prevLine) continue;

      // If we find an unclosed block start, we're not at top level
      if (prevLine.match(/\/exe\s+@\w+.*=\s*\[/) ||
          prevLine.match(/\/for\s+.*\[/) ||
          prevLine.match(/=\s*\[\s*$/)) {
        return false;
      }
    }

    return true;
  },

  enhance(error, mx) {
    // Extract the variable name being defined
    const varMatch = mx.line.match(/let\s+@(\w+)/);
    const varName = varMatch ? varMatch[1] : 'x';

    // Extract the value if present
    const valueMatch = mx.line.match(/let\s+@\w+\s*=\s*(.+)/);
    const value = valueMatch ? valueMatch[1].trim() : '...';

    return {
      VARNAME: varName,
      VALUE: value,
      LINE: mx.lineNumber
    };
  }
};
