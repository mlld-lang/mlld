export const pattern = {
  name: 'comment-in-object-literal',
  
  test(error, ctx) {
    // Check if error is inside an object literal
    return (ctx.line.includes('<<') || ctx.line.includes('>>')) &&
           ctx.lines.some(line => line.includes('{')) &&
           ctx.lines.some((line, idx) => {
             // Look for object property pattern
             return line.includes(':') && !line.includes('when:');
           }) &&
           (error.message.includes('Unclosed object') || 
            error.message.includes('Expected'));
  },
  
  enhance(error, ctx) {
    const commentMarker = ctx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'object literal'
    };
  }
};