export const pattern = {
  name: 'comment-in-when-implicit',
  
  test(error, mx) {
    // Check if error is in a standalone when array
    return (mx.line.includes('<<') || mx.line.includes('>>')) &&
           mx.lines.some(line => line.trim().startsWith('/when:')) &&
           error.message.includes('Expected');
  },
  
  enhance(error, mx) {
    const commentMarker = mx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'when block'
    };
  }
};