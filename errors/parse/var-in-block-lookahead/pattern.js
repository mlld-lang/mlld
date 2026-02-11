export const pattern = {
  name: 'var-in-block-lookahead',

  test(error, mx) {
    // This catches the case where var inside a block causes a parse error
    // on a DIFFERENT line (usually the preceding directive or the ] else [ line).
    // The existing var-in-block pattern catches when the error points directly
    // at the var line; this catches the cascade.

    // Only match "Expected end of input" errors
    if (!error.message?.includes('Expected end of input')) {
      return false;
    }

    // The error line itself should NOT be a var line (that's var-in-block's job)
    if (/^\s*\/?var\s+@/.test(mx.line)) {
      return false;
    }

    // Must be inside a block (indented)
    if (!/^\s+/.test(mx.line)) {
      return false;
    }

    // Look forward for a var @ line within the next 10 lines
    for (let i = mx.lineNumber; i < Math.min(mx.lines.length, mx.lineNumber + 10); i++) {
      const nextLine = mx.lines[i] || '';
      // Found var inside the block
      if (/^\s+\/?var\s+@/.test(nextLine)) {
        return true;
      }
      // Hit end of block — stop looking
      if (/^\s*\]/.test(nextLine) && !/^\s*\]\s*else\s*\[/.test(nextLine)) {
        return false;
      }
    }

    return false;
  },

  enhance(error, mx) {
    let varName = 'value';
    let varLine = mx.lineNumber;

    // Find the var line
    for (let i = mx.lineNumber; i < Math.min(mx.lines.length, mx.lineNumber + 10); i++) {
      const nextLine = mx.lines[i] || '';
      const match = nextLine.match(/var\s+@([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (match) {
        varName = match[1];
        varLine = i + 1;
        break;
      }
    }

    // Find block type by looking back
    let blockType = 'block';
    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i] || '';
      const match = prevLine.match(/\b(if|else|for|loop|while|guard)\b/);
      if (match) {
        blockType = match[1];
        break;
      }
    }

    return {
      VARNAME: varName,
      BLOCK: blockType,
      VARLINE: varLine
    };
  }
};
