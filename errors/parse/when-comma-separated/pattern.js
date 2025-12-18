export const pattern = {
  name: 'when-comma-separated',
  
  test(error, mx) {
    // Check if this is a when expression parsing error
    // Look for patterns like "condition => action, condition => action"
    if (!mx.line) return false;
    
    // Check if we're in a when context
    const prevLines = mx.lines.slice(Math.max(0, mx.lineNumber - 3), mx.lineNumber).join('\n');
    const hasWhenContext = /when\s*\[/.test(prevLines) || /when\s*\[/.test(mx.line);
    
    // Check if the line has the comma-separated pattern
    const hasCommaSeparatedConditions = /=>\s*[^,]+,\s*[@*]/.test(mx.line);
    
    return hasWhenContext && hasCommaSeparatedConditions;
  },
  
  enhance(error, mx) {
    // Extract the conditions from the line
    const matches = mx.line.match(/(.+?)\s*=>\s*(.+?),\s*(.+?)\s*=>\s*(.+)/);
    
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
        LINE: mx.line.trim()
      };
    }
    
    // Fallback if we can't parse the exact structure
    return {
      LINE: mx.line.trim(),
      FIRST_CONDITION: '@condition1',
      FIRST_ACTION: 'action1',
      SECOND_CONDITION: '@condition2',
      SECOND_ACTION: 'action2'
    };
  }
};