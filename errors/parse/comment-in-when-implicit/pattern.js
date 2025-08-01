export const pattern = {
  name: 'comment-in-when-implicit',
  
  test(error, ctx) {
    // Check if error is in a standalone when array
    return (ctx.line.includes('<<') || ctx.line.includes('>>')) &&
           ctx.lines.some(line => line.trim().startsWith('/when:')) &&
           error.message.includes('Expected');
  },
  
  enhance(error, ctx) {
    const commentMarker = ctx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'when block'
    };
  }
};