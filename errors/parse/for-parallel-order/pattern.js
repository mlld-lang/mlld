export const pattern = {
  name: 'for-parallel-order',

  test(error, ctx) {
    // Check if error is about invalid /for syntax
    if (error.message && error.message.includes('Invalid /for syntax')) {
      // Look for "for parallel" followed by a number (wrong order)
      // Correct order is: for 18 parallel
      // Wrong order is: for parallel 18
      return ctx.line && ctx.line.match(/\/for\s+parallel\s+\d+/);
    }
    return false;
  },

  enhance(error, ctx) {
    // Extract the number that came after "parallel"
    const match = ctx.line.match(/\/for\s+parallel\s+(\d+)/);
    const cap = match ? match[1] : 'N';

    return {
      CAP: cap
    };
  }
};
