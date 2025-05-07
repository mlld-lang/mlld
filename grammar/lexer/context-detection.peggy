// Context detection for @ symbol disambiguation
// Returns what kind of context we're in for proper @ handling

// Helper rule to check if we're at a position where a top-level directive could start
IsTopLevelDirective "Check for top-level directive"
  = &{
      const pos = offset();
      // Check if at logical line start
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);

      // If at line start and followed by a valid directive name, it's a top-level directive
      if (isAtLineStart && input[pos] === '@') {
        // Peek ahead to see if a valid directive name follows
        let i = pos + 1;
        let name = '';

        // Collect the potential directive name
        while (i < input.length && /[a-z]/.test(input[i])) {
          name += input[i];
          i++;
        }

        // Check against list of valid directive names
        const validDirectives = ['run', 'exec', 'text', 'add', 'import', 'path', 'data'];
        return validDirectives.includes(name);
      }

      return false;
    } { return true; }

// Helper rule to check if we're in the right-hand side of an assignment
IsRhsDirective "Check for RHS directive"
  = &{
      const pos = offset();
      // This is our existing IsInsideRHS logic, but enhanced to return directive type
      let isRhs = false;
      let directiveType = '';

      // Look backwards for '='
      let i = pos - 1;
      while (i >= 0) {
        if (input[i] === ' ' || input[i] === '\t') {
          i--;
          continue;
        }

        if (input[i] === '=') {
          // Found equals sign, now look for directive on LHS
          let j = i - 1;

          // Skip whitespace
          while (j >= 0 && (input[j] === ' ' || input[j] === '\t')) {
            j--;
          }

          // Collect directive name
          let name = '';
          while (j >= 0 && /[a-zA-Z0-9_]/.test(input[j])) {
            name = input[j] + name;
            j--;
          }

          // Check for @ symbol
          if (j >= 0 && input[j] === '@') {
            // Valid assignment directives
            const validAssignmentDirectives = ['exec', 'text', 'data'];
            if (validAssignmentDirectives.includes(name)) {
              isRhs = true;
              directiveType = name;
              break;
            }
          }
        }

        if (input[i] === '\n') break;
        i--;
      }

      options.rhsDirectiveType = directiveType;
      return isRhs;
    } { return true; }

// Helper rule to check if we're after a specific directive keyword that takes @ references
IsAfterDirectiveKeyword "Check for after-directive keyword"
  = &{
      const pos = offset();
      let isAfter = false;
      let directiveType = '';

      // Look backwards for directive keywords
      let i = pos - 1;
      let seenSpace = false;

      // Skip whitespace immediately before current position
      while (i >= 0 && (input[i] === ' ' || input[i] === '\t')) {
        seenSpace = true;
        i--;
      }

      // We need at least one space between directive and @
      if (!seenSpace) return false;

      // Check for keywords
      const keywords = {
        'run': true,    // @run @command
        'add': true,    // @add @variable
        'import': true  // @import @variable
      };

      // Collect the word before the space
      let word = '';
      while (i >= 0 && /[a-z]/.test(input[i])) {
        word = input[i] + word;
        i--;
      }

      // Check if it's a valid keyword
      if (keywords[word]) {
        // Check if preceded by @ (to confirm it's a directive)
        if (i >= 0 && input[i] === '@') {
          isAfter = true;
          directiveType = word;
        }
      }
    
      options.afterDirectiveType = directiveType;
      return isAfter;
    } { return true; }

// Helper rule to check if we're in an interpolation context (inside brackets, etc.)
IsInInterpolationContext "Check for interpolation context"
  = &{
      const pos = offset();
      // Check if we're inside brackets or other interpolation context
      let i = pos - 1;
      let bracketCount = 0;

      while (i >= 0) {
        if (input[i] === '[') {
          bracketCount++;
        } else if (input[i] === ']') {
          bracketCount--;
        } else if (input[i] === '\n') {
          // New line, reset context
          bracketCount = 0;
        }

        i--;
      }

      // If bracketCount > 0, we're inside brackets
      return bracketCount > 0;
    } { return true; }

// Main detection rule - returns the context type for the current position
DetectAtContext "Detect @ symbol context"
  = topLevel:IsTopLevelDirective {
      return { contextType: 'top-level-directive' };
    }
  / rhs:IsRhsDirective {
      return { 
        contextType: 'rhs-directive',
        directive: options.rhsDirectiveType || '' 
      };
    }
  / afterDir:IsAfterDirectiveKeyword {
      return { 
        contextType: 'after-directive', 
        directive: options.afterDirectiveType || '' 
      };
    }
  / intp:IsInInterpolationContext {
      return { contextType: 'variable-reference' };
    }
  / &{ return true; } {
      return { contextType: 'plain-text' };
    }
