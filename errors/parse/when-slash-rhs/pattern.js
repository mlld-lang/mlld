export const pattern = {
  name: 'when-slash-rhs',
  
  test(error, ctx) {
    // Check if it's related to /when with slashes on RHS
    return ctx.line.includes('/when') && 
           ctx.line.includes('=>') &&
           ctx.line.includes('=> /');
  },
  
  enhance(error, ctx) {
    // Extract the when condition and action
    const whenMatch = ctx.line.match(/\/when\s+(.+?)\s+=>\s+(.+)/);
    const condition = whenMatch ? whenMatch[1] : '@condition';
    const action = whenMatch ? whenMatch[2].trim() : '/show "text"';
    
    // Remove leading slash from action
    const fixedAction = action.startsWith('/') ? action.substring(1) : action;
    
    // Determine the directive type from the action
    let directive = 'show';
    if (action.includes('output')) directive = 'output';
    else if (action.includes('var')) directive = 'var';
    else if (action.includes('run')) directive = 'run';
    
    return {
      CONDITION: condition,
      ACTION: action,
      FIXED_ACTION: fixedAction,
      DIRECTIVE: directive
    };
  }
};