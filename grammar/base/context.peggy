// MELD GRAMMAR CONTEXT DETECTION
// A comprehensive system for disambiguating different code contexts

/* 
# Context Detection System

This file provides a core abstraction for detecting different contexts in Meld grammar,
with a particular focus on disambiguating @ symbol usage between:

1. DirectiveContext   - Top-level directive start (e.g., @run, @text)
2. VariableContext    - Variable reference (e.g., @varName)
3. RHSContext         - Right-hand side of assignment (e.g., value = @run)
4. PlainTextContext   - Regular text containing @ symbol

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
      return helpers.isAtDirectiveContext(input, pos);
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
// CONTEXT DETECTION ARCHITECTURE
// -------------------------------------------------------------

/*
Context detection relies on these helper methods in grammar-core.js:

- Context Classification Methods:
  • isAtDirectiveContext(input, pos) - Detects top-level directives
  • isAtVariableContext(input, pos) - Identifies variable references 
  • isRHSContext(input, pos) - Determines right-hand side expressions
  • isPlainTextContext(input, pos) - Identifies plain text occurrences

These predicates provide a consistent approach to disambiguating
the @ symbol across different contexts in the grammar, allowing
for cleaner separation of concerns in directive implementations.
*/