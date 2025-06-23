// RHS (Right-Hand Side) PATTERNS
// This file defines patterns for right-hand side expressions in directive assignments

/* 
# RHS Pattern System

Handles right-hand side expressions in directive assignments like:
- @text name = "value"
- @text name = @run command
- @data obj = { "key": "value" }

Each RHS context needs specialized handling to properly disambiguate
nested directives from variable references within the assignment value.
*/


// -------------------------------------------------------------
// RHS DETECTION - Identify and mark RHS context
// -------------------------------------------------------------

// Predicate to check if we're in a RHS context (used by nested directives)
IsInRHS "In right-hand side of assignment"
  = &{
      const pos = offset();
      return helpers.isRHSContext(input, pos);
    }

// -------------------------------------------------------------
// TEXT RHS PATTERNS - REMOVED (replaced by /var directive)
// -------------------------------------------------------------

// These patterns are no longer used since /text directive is deleted
// TextRHS removed

// -------------------------------------------------------------
// DATA RHS PATTERNS - REMOVED (replaced by /var directive)
// -------------------------------------------------------------

// These patterns are no longer used since /data directive is deleted
// DataRHS, DataProperties, DataProperty, DataItems, DataLiteral removed

// -------------------------------------------------------------
// RUN RHS PATTERNS - Values for @run assignments
// -------------------------------------------------------------

// RHS value for @run directive
RunRHS
  = command:WrappedCommandContent {
      return {
        type: 'command',
        command: command.parts,
        raw: command.raw
      };
    }
  / code:WrappedCodeContent {
      return {
        type: 'code',
        code: code.parts,
        raw: code.raw
      };
    }

