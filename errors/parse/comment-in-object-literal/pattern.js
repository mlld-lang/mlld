export const pattern = {
  name: 'comment-in-object-literal',
  
  test(error, mx) {
    // Check if error is inside an object literal
    return (mx.line.includes('<<') || mx.line.includes('>>')) &&
           mx.lines.some(line => line.includes('{')) &&
           mx.lines.some((line, idx) => {
             // Look for object property pattern
             return line.includes(':') && !line.includes('when:');
           }) &&
           (error.message.includes('Unclosed object') || 
            error.message.includes('Expected'));
  },
  
  enhance(error, mx) {
    const commentMarker = mx.line.includes('<<') ? '<<' : '>>';
    
    return {
      MARKER: commentMarker,
      CONTEXT: 'object literal'
    };
  }
};