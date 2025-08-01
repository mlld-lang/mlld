export const pattern = {
  name: 'comment-in-when-array-var',
  
  test(error, ctx) {
    // Check if error is in a when array inside a var directive
    return (ctx.line.includes('<<') || ctx.line.includes('>>')) &&
           ctx.lines.some(line => line.includes('/var')) &&
           ctx.lines.some(line => line.includes('when:')) &&
           (error.message.includes('Unclosed array in when expression') || 
            error.message.includes('Expected'));
  },
  
  enhance(error, ctx) {
    const commentMarker = ctx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'when expression'
    };
  }
};