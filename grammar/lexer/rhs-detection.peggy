// Utility rules for right-hand side of assignment detection

// Helper rule to detect if we're in the right-hand side of an assignment
// Used by meld.peggy to prevent nested directive tokens from being
// incorrectly recognized as top-level directives
IsInsideRHS "Check if we're in RHS of assignment"
  = &{
      // Check if we're inside a RHS assignment context
      const pos = offset();
      let isInsideRHS = false;
      let i = pos - 1;
      let foundEquals = false;
      
      // Skip back to find an equals sign, handling whitespace
      while (i >= 0) {
        // Skip whitespace
        if (input[i] === ' ' || input[i] === '\t') {
          i--;
          continue;
        }
        
        // If we find equals, we might be in RHS
        if (input[i] === '=') {
          foundEquals = true;
          break;
        }
        
        // If we hit a line start or non-space before finding '=', we're not in RHS
        if (input[i] === '\n' || !/[ \t=]/.test(input[i])) {
          break;
        }
        
        i--;
      }
      
      // We found an equals sign, now check if there's valid LHS
      if (foundEquals) {
        // Go back further to look for a valid directive token before the equals
        let j = i - 1;
        let textContext = '';
        let directiveStart = -1;
        
        // Skip whitespace
        while (j >= 0 && (input[j] === ' ' || input[j] === '\t')) {
          j--;
        }
        
        // Collect potential directive name
        let nameEnd = j;
        while (j >= 0 && /[a-zA-Z0-9_]/.test(input[j])) {
          textContext = input[j] + textContext;
          j--;
        }
        let nameStart = j + 1;
        
        // Check for @ symbol indicating directive assignment
        if (j >= 0 && input[j] === '@') {
          directiveStart = j;
          j--;
          
          // Skip whitespace before directive
          while (j >= 0 && (input[j] === ' ' || input[j] === '\t')) {
            j--;
          }
          
          // If we reached a line start or the beginning, this is a directive assignment
          if (j < 0 || input[j] === '\n') {
            // Only consider valid directive kinds that can have nested directives
            const validAssignmentDirectives = ['exec', 'text'];
            if (validAssignmentDirectives.includes(textContext)) {
              isInsideRHS = true;
            }
          }
        }
      }
      
      return isInsideRHS;
    } { return true; }