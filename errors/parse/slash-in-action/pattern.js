export const pattern = {
  name: 'slash-in-action',
  
  test(error, mx) {
    // Check if we're in a when expression and found a slash
    if (error.message && error.message.includes('Unclosed array in when expression')) {
      // Look ahead to see if there's a slash-prefixed directive
      const nextLineIndex = mx.lineNumber; // This is 1-based
      if (nextLineIndex < mx.lines.length) {
        const nextLine = mx.lines[nextLineIndex];
        return nextLine && nextLine.match(/=>\s*\/\w+/);
      }
    }
    return false;
  },
  
  enhance(error, mx) {
    // Look at the next line for the directive
    const nextLineIndex = mx.lineNumber;
    const nextLine = mx.lines[nextLineIndex] || '';
    const match = nextLine.match(/=>\s*\/(\w+)/);
    const directive = match ? match[1] : 'directive';
    
    return {
      DIRECTIVE: directive,
      CORRECT_SYNTAX: directive
    };
  }
};