export const pattern = {
  name: 'comment-in-array-literal',
  
  test(error, mx) {
    // Check if error is inside an array literal with object-like syntax
    return (mx.line.includes('<<') || mx.line.includes('>>')) &&
           mx.lines.some(line => line.includes('[')) &&
           mx.line.includes(':') &&
           error.message.includes('Expected');
  },
  
  enhance(error, mx) {
    const commentMarker = mx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'array literal'
    };
  }
};