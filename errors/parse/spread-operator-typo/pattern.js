export const pattern = {
  name: 'spread-operator-typo',

  test(error, mx) {
    if (!mx.line) return false;
    return /\.\.\s*@/.test(mx.line);
  },

  enhance(error, mx) {
    const match = mx.line.match(/\.\.\s*@([A-Za-z0-9_]+)/);

    return {
      VARNAME: match?.[1] || 'value',
      LINE: mx.line.trim()
    };
  }
};
