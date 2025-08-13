export const pattern = {
  name: 'slash-in-action',
  
  test(error, ctx) {
    // Check if we're in a when expression and found a slash
    if (error.message && error.message.includes('Unclosed array in when expression')) {
      // Look ahead to see if there's a slash-prefixed directive
      const nextLineIndex = ctx.lineNumber; // This is 1-based
      if (nextLineIndex < ctx.lines.length) {
        const nextLine = ctx.lines[nextLineIndex];
        return nextLine && nextLine.match(/=>\s*\/\w+/);
      }
    }
    return false;
  },
  
  enhance(error, ctx) {
    // Look at the next line for the directive
    const nextLineIndex = ctx.lineNumber;
    const nextLine = ctx.lines[nextLineIndex] || '';
    const match = nextLine.match(/=>\s*\/(\w+)/);
    const directive = match ? match[1] : 'directive';
    
    return {
      DIRECTIVE: directive,
      CORRECT_SYNTAX: directive
    };
  }
};