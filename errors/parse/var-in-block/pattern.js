export const pattern = {
  name: 'var-in-block',

  test(error, mx) {
    const line = mx.line || '';
    if (!/^\s*\/?var\s+@/.test(line)) {
      return false;
    }

    if (!/^\s+/.test(line)) {
      return false;
    }

    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i] || '';
      if (prevLine.match(/\/exe\s+@\w+.*=\s*\[/)) {
        return false;
      }
      if (prevLine.match(/\/exe\s+@\w+.*=\s*when/)) {
        return false;
      }
      if (prevLine.match(/^\s*\/(?!exe)\w+/)) {
        break;
      }
    }

    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i] || '';
      if (prevLine.match(/\b(if|for|loop|while|guard)\b[^\n]*\[\s*$/)) {
        return true;
      }
    }

    return true;
  },

  enhance(error, mx) {
    const varMatch = mx.line.match(/var\s+@([a-zA-Z_][a-zA-Z0-9_]*)/);
    const varName = varMatch ? varMatch[1] : 'value';

    let blockType = 'block';
    for (let i = mx.lineNumber - 2; i >= Math.max(0, mx.lineNumber - 20); i--) {
      const prevLine = mx.lines[i] || '';
      const match = prevLine.match(/\b(if|for|loop|while|guard)\b/);
      if (match) {
        blockType = match[1];
        break;
      }
    }

    return {
      VARNAME: varName,
      BLOCK: blockType
    };
  }
};
