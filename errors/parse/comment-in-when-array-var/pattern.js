export const pattern = {
  name: 'comment-in-when-array-var',
  
  test(error, mx) {
    // Check if error is in a when array inside a var directive
    return (mx.line.includes('<<') || mx.line.includes('>>')) &&
           mx.lines.some(line => line.includes('/var')) &&
           mx.lines.some(line => line.includes('when:')) &&
           (error.message.includes('Unclosed array in when expression') || 
            error.message.includes('Expected'));
  },
  
  enhance(error, mx) {
    const commentMarker = mx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'when expression'
    };
  }
};