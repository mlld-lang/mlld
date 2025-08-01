export const pattern = {
  name: 'comment-in-array-literal',
  
  test(error, ctx) {
    // Check if error is inside an array literal with object-like syntax
    return (ctx.line.includes('<<') || ctx.line.includes('>>')) &&
           ctx.lines.some(line => line.includes('[')) &&
           ctx.line.includes(':') &&
           error.message.includes('Expected');
  },
  
  enhance(error, ctx) {
    const commentMarker = ctx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'array literal'
    };
  }
};