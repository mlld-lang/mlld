export const pattern = {
  name: 'type-mismatch-iteration',

  test(error, ctx) {
    if (!error || !error.message) return false;
    return (
      error.message.includes('Cannot iterate over') ||
      error.message.includes('Type mismatch: /for expects an array')
    );
  },

  enhance(error, ctx) {
    // Extract received type from message if present
    let received = (error.message.match(/over (\w+)/) || [])[1] ||
                   (error.message.match(/Received: ([^\s\(]+)/) || [])[1] || 'unknown';
    const snippet = (ctx.code || '').split('\n')[0] || '/for @item in <expr> => ...';
    const hint = "'/for' requires an array to iterate. Ensure the right-hand expression evaluates to an array; use @ensureArray(...) if needed.";
    return {
      EXPECTED: 'Array',
      RECEIVED: received,
      SNIPPET: snippet.trim(),
      HINT: hint
    };
  }
};

