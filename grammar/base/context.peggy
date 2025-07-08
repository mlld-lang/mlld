// MLLD GRAMMAR CONTEXT DETECTION
// A comprehensive system for disambiguating different code contexts

/* 
# Context Detection System

This file provides a core abstraction for detecting different contexts in Mlld grammar,
with a particular focus on disambiguating @ symbol usage between:

1. DirectiveContext   - Top-level directive start (e.g., @run, @text)
2. VariableContext    - Variable reference (e.g., @varName)
3. RHSContext         - Right-hand side of assignment (e.g., value = @run)
4. CodeBlockContext   - Language + code block patterns in various contexts
5. PlainTextContext   - Regular text containing @ symbol

The context predicates here serve as the foundation for consistent parsing
across the grammar system.
*/

// -------------------------------------------------------------
// CONTEXT PREDICATES - Non-consuming rules that detect context
// -------------------------------------------------------------

// Checks if we're at a position where a top-level directive could start
DirectiveContext "Top-level directive context"
  = &{
      const pos = offset();
      return helpers.isSlashDirectiveContext(input, pos);
    }

// Checks if we're in a context where @ is used for a variable reference
VariableContext "Variable reference context"
  = &{
      const pos = offset();
      return helpers.isAtVariableContext(input, pos);
    }

// Checks if we're in the right-hand side of an assignment
RHSContext "Right-hand side context"
  = &{
      const pos = offset();
      return helpers.isRHSContext(input, pos);
    }

// Checks if we're in plain text context (not a directive, variable, or RHS)
PlainTextContext "Plain text context"
  = &{
      const pos = offset();
      return helpers.isPlainTextContext(input, pos);
    }

// -------------------------------------------------------------
// ENHANCED CONTEXT PREDICATES - More specific context detection
// -------------------------------------------------------------

// Detects if we're in a Run-style code block context
// This helps disambiguate language + code block patterns in different contexts
RunCodeBlockContext "Run-style code block context"
  = &{
      const pos = offset();
      
      // Check if we're at a code block pattern following a language identifier
      // This requires looking back to see if we have a valid language pattern
      // and forward to see if we have a code block pattern
      
      // First determine if we're in an RHS context
      const isRHS = helpers.isRHSContext(input, pos);
      
      // Then check if we're preceded by "/run" or in a context that expects 
      // a language + code block pattern
      let isInRunContext = false;
      
      // Look backward for "/run" pattern if in RHS context
      if (isRHS) {
        // Search backward for "/run" indicator within reasonable bounds
        // This is a simplified check - a more comprehensive implementation
        // would match the exact pattern for "/run" in different contexts
        let i = pos - 1;
        let seenSlashSymbol = false;
        let potentialRunKeyword = '';
        
        // Skip whitespace
        while (i >= 0 && ' \t\r\n'.includes(input[i])) {
          i--;
        }
        
        // Collect potential keyword and check for / symbol
        while (i >= 0 && /[a-zA-Z]/.test(input[i])) {
          potentialRunKeyword = input[i] + potentialRunKeyword;
          i--;
        }
        
        // Check for / symbol
        if (i >= 0 && input[i] === '/') {
          seenSlashSymbol = true;
        }
        
        // If we've seen /run, we're in a run code block context
        if (seenSlashSymbol && potentialRunKeyword === 'run') {
          isInRunContext = true;
        }
      }
      
      return isInRunContext || helpers.isInRunCodeBlockContext(input, pos);
    }

// Specialized RHS context for exec directive that handles /run reference
ExecRunRHSContext "Exec /run right-hand side context"
  = &{
      const pos = offset();
      
      // Check both RHS context and the presence of /run pattern
      if (!helpers.isRHSContext(input, pos)) {
        return false;
      }
      
      // Look backward for "/exec" to confirm we're in an exec directive
      let isInExecDirective = false;
      let i = pos - 1;
      
      // This is a simplified check - would need a more robust pattern 
      // matching in a full implementation
      let foundEquals = false;
      let foundExec = false;
      
      // First find equals sign
      while (i >= 0 && !foundEquals) {
        if (input[i] === '=') {
          foundEquals = true;
        } else if (input[i] === '\n') {
          // If we hit a newline before equals, we're not in the right context
          return false;
        }
        i--;
      }
      
      if (foundEquals) {
        // Then look for exec
        // Skip whitespace before equals
        i--;
        while (i >= 0 && ' \t\r'.includes(input[i])) {
          i--;
        }
        
        // Collect potential keyword
        let keyword = '';
        while (i >= 0 && /[a-zA-Z]/.test(input[i])) {
          keyword = input[i] + keyword;
          i--;
        }
        
        // Check for / symbol
        if (i >= 0 && input[i] === '/') {
          if (keyword === 'exec') {
            isInExecDirective = true;
          }
        }
      }
      
      return isInExecDirective;
    }

// Detects if we're looking at a path pattern starting with @variable
// This helps distinguish paths like @env/config.json from command references
PathStartingWithVariableContext "Path starting with @variable context"
  = &{
      const pos = offset();
      
      // Look ahead to see if we have @identifier followed by path indicators
      const remaining = input.substring(pos);
      
      // Match @identifier followed by / or . (path indicators)
      // This pattern identifies paths that start with variables
      const pathPattern = /^@[a-zA-Z_][a-zA-Z0-9_]*[\/\.]/;
      
      return pathPattern.test(remaining);
    }

// -------------------------------------------------------------
// DIRECTIVE BOUNDARY - State reset between directives
// -------------------------------------------------------------

// This rule is used to reset parser state between directives,
// particularly important in mlld-run blocks where multiple complex
// functions can cause state corruption
DirectiveBoundary "Directive boundary"
  = &{
      // Reset parser state between directives to prevent corruption
      helpers.resetCodeParsingState();
      helpers.debug('DirectiveBoundary: Parser state reset between directives');
      return true;
    }

// -------------------------------------------------------------
// CONTEXT DETECTION ARCHITECTURE
// -------------------------------------------------------------

/*
Context detection relies on these helper methods in grammar-core.js:

- Context Classification Methods:
  • isSlashDirectiveContext(input, pos) - Detects top-level slash directives
  • isAtVariableContext(input, pos) - Identifies variable references 
  • isRHSContext(input, pos) - Determines right-hand side expressions
  • isPlainTextContext(input, pos) - Identifies plain text occurrences
  • isInRunCodeBlockContext(input, pos) - Identifies language + code block patterns

These predicates provide a consistent approach to disambiguating
the @ symbol across different contexts in the grammar, allowing
for cleaner separation of concerns in directive implementations.

The enhanced context predicates provide more specific context detection
for specialized cases like language + code block patterns in different
directive contexts, which is particularly important for consistent parsing
between run.peggy and exec.peggy.

The PathStartingWithVariableContext predicate helps distinguish between
paths that start with variables (like @env/config.json) and command
references, preventing incorrect parsing in text.peggy and similar contexts.

The DirectiveBoundary predicate is used to reset parser state between
directives, preventing state corruption when parsing multiple complex
functions in mlld-run blocks.
*/