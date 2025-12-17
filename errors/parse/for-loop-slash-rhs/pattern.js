export const pattern = {
  name: 'for-loop-slash-rhs',
  
  test(error, mx) {
    // Check if it's a for loop with slash on RHS
    return error.message && 
           error.message.includes("Unexpected '/' in for loop action") &&
           mx.line.includes('/for') &&
           mx.line.includes('=>');
  },
  
  enhance(error, mx) {
    // Extract the for loop parts
    const forMatch = mx.line.match(/\/for\s+@(\w+)\s+in\s+(.+?)\s+=>\s+(.+)/);
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