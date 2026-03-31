export const pattern = {
  name: 'object-complex-expression',

  test(error, mx) {
    if (!error.message || !error.message.includes('Unclosed object')) return false;
    if (!mx.lines) return false;

    // Look for a parenthesized expression with a tail accessor inside an object literal
    for (const line of mx.lines) {
      if (line.match(/:\s*\(.*\)\.\w+/)) return true;
    }
    return false;
  },

  enhance(error, mx) {
    let fieldLine = '';
    let fieldName = '';
    let expression = '';

    for (const line of mx.lines) {
      const match = line.match(/(\w+)\s*:\s*(\(.*\)\.\w+)/);
      if (match) {
        fieldLine = line.trim();
        fieldName = match[1];
        expression = match[2];
        break;
      }
    }

    return {
      FIELD_LINE: fieldLine,
      FIELD_NAME: fieldName,
      EXPRESSION: expression
    };
  }
};
