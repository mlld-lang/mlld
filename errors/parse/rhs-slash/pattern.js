export const pattern = {
  name: 'rhs-slash',
  
  test(error, ctx) {
    // Check if the error is about a slash in an action context
    // This happens when someone tries to use /show, /run, etc. after =>
    const line = ctx.line || '';
    
    // Check for patterns like "=> /show" or "=> /run" or "=> /output" or "=> /var"
    if (line.includes('=>') && line.includes('/')) {
      const afterArrow = line.substring(line.indexOf('=>') + 2).trim();
      if (afterArrow.startsWith('/')) {
        return true;
      }
    }
    
    // Check for /exe RHS with /run
    if (line.includes('/exe') && line.includes('= /run')) {
      return true;
    }
    
    // Check for /var RHS with /run
    if (line.includes('/var') && line.includes('= /run')) {
      return true;
    }
    
    // Check for /for actions with slashes
    if (line.includes('/for') && line.includes('=>') && line.includes('/')) {
      const afterArrow = line.substring(line.indexOf('=>') + 2).trim();
      if (afterArrow.startsWith('/')) {
        return true;
      }
    }
    
    return false;
  },
  
  enhance(error, ctx) {
    const line = ctx.line || '';
    
    // Extract the directive that was incorrectly prefixed
    let directive = 'unknown';
    let context = 'action';
    
    if (line.includes('=>')) {
      const afterArrow = line.substring(line.indexOf('=>') + 2).trim();
      const match = afterArrow.match(/^\/(\w+)/);
      if (match) {
        directive = match[1];
      }
      
      if (line.includes('/when')) {
        context = 'when action';
      } else if (line.includes('/for')) {
        context = 'for loop action';
      }
    } else if (line.includes('/exe') && line.includes('= /run')) {
      directive = 'run';
      context = 'exe assignment';
    } else if (line.includes('/var') && line.includes('= /run')) {
      directive = 'run';
      context = 'var assignment';
    }
    
    return {
      DIRECTIVE: directive,
      CONTEXT: context,
      LINE: line.trim()
    };
  }
};