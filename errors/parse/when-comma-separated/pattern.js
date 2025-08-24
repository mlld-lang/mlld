export const pattern = {
  name: 'when-comma-separated',
  
  test(error, ctx) {
    // Check if this is a when expression parsing error
    // Look for patterns like "condition => action, condition => action"
    if (!ctx.line) return false;
    
    // Check if we're in a when context
    const prevLines = ctx.lines.slice(Math.max(0, ctx.lineNumber - 3), ctx.lineNumber).join('\n');
    const hasWhenContext = /when\s*\[/.test(prevLines) || /when\s*\[/.test(ctx.line);
    
    // Check if the line has the comma-separated pattern
    const hasCommaSeparatedConditions = /=>\s*[^,]+,\s*[@*]/.test(ctx.line);
    
    return hasWhenContext && hasCommaSeparatedConditions;
  },
  
  enhance(error, ctx) {
    // Extract the conditions from the line
    const matches = ctx.line.match(/(.+?)\s*=>\s*(.+?),\s*(.+?)\s*=>\s*(.+)/);
    
    if (matches) {
      const firstCondition = matches[1].trim();
      const firstAction = matches[2].trim();
      const secondCondition = matches[3].trim();
      const secondAction = matches[4].trim();
      
      return {
        FIRST_CONDITION: firstCondition,
        FIRST_ACTION: firstAction,
        SECOND_CONDITION: secondCondition,
        SECOND_ACTION: secondAction,
        LINE: ctx.line.trim()
      };
    }
    
    // Fallback if we can't parse the exact structure
    return {
      LINE: ctx.line.trim(),
      FIRST_CONDITION: '@condition1',
      FIRST_ACTION: 'action1',
      SECOND_CONDITION: '@condition2',
      SECOND_ACTION: 'action2'
    };
  }
};