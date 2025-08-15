export const pattern = {
  name: 'for-loop-slash-rhs',
  
  test(error, ctx) {
    // Check if it's a for loop with slash on RHS
    return error.message && 
           error.message.includes("Unexpected '/' in for loop action") &&
           ctx.line.includes('/for') &&
           ctx.line.includes('=>');
  },
  
  enhance(error, ctx) {
    // Extract the for loop parts
    const forMatch = ctx.line.match(/\/for\s+@(\w+)\s+in\s+(.+?)\s+=>\s+(.+)/);
    const varName = forMatch ? forMatch[1] : 'item';
    const collection = forMatch ? forMatch[2] : '@collection';
    const action = forMatch ? forMatch[3].trim() : '/show @item';
    
    // Remove leading slash from action if present
    const fixedAction = action.startsWith('/') ? action.substring(1) : action;
    
    return {
      VAR: varName,
      COLLECTION: collection,
      ACTION: action,
      FIXED_ACTION: fixedAction
    };
  }
};