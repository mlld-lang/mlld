export const pattern = {
  name: 'template-outside-exe',

  test(error, mx) {
    // Match errors where 'template' keyword is used in var context
    // The parser sees: var @name = template "..."
    // And fails because template isn't a valid var value

    // Check if line contains 'var' and 'template' together (with possible indentation)
    const line = mx.line || '';
    const hasVarTemplate = /^\s*var\s+@\w+\s*=\s*template\s/.test(line);

    // Also match 'let' context inside blocks
    const hasLetTemplate = /^\s*let\s+@\w+\s*=\s*template\s/.test(line);

    return hasVarTemplate || hasLetTemplate;
  },

  enhance(error, mx) {
    const line = mx.line || '';

    // Extract variable name
    const varMatch = line.match(/(var|let)\s+(@\w+)\s*=\s*template/);
    const varName = varMatch ? varMatch[2] : '@variable';
    const keyword = varMatch ? varMatch[1] : 'var';

    return {
      VARNAME: varName,
      KEYWORD: keyword,
      LINE: line.trim()
    };
  }
};
