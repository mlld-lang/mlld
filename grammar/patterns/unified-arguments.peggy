// UNIFIED ARGUMENTS
// Single source of truth for all argument list handling across mlld grammar

/* 
# Unified Argument System

This file provides unified argument list handling that can be used by:
- /run directive for code execution arguments
- /exec directive for executable arguments
- /output directive for output arguments  
- /show directive for template arguments
- Command references for command arguments
- Pipe transforms for pipe arguments

Argument lists support:
- Variables with field access: @var.field[index]
- Literals: strings, numbers, booleans, arrays, objects
- Nested function calls: @func(@arg)
- Template arguments: ::template:: and `template`
- File loading: <file.md>
- Primitive values and escaped arguments

This consolidates 5+ incompatible argument systems into one unified approach.
*/

// -------------------------------------------------------------
// UNIFIED ARGUMENT LIST - Main entry point
// -------------------------------------------------------------

// Single source of truth for all argument list handling
UnifiedArgumentList
  = "(" _ args:UnifiedArgumentListItems? _ ")" {
      helpers.debug('UnifiedArgumentList matched', { args });
      
      return {
        type: 'argumentList',
        arguments: args || [],
        isEmpty: !args || args.length === 0,
        argumentCount: args ? args.length : 0,
        location: location()
      };
    }

UnifiedArgumentListItems
  = head:UnifiedArgument tail:(_ "," _ arg:UnifiedArgument { return arg; })* {
      // Filter out null arguments (from empty raw arguments)
      const args = [head, ...tail].filter(arg => arg !== null);
      return args;
    }

// -------------------------------------------------------------
// UNIFIED ARGUMENT - Individual argument handling
// -------------------------------------------------------------

// Use existing proven patterns from CommandArgument - handles all edge cases
UnifiedArgument "unified argument"
  = WhenExpression              // Allow when-expressions as arguments
  / ForeachCommandExpression    // Allow foreach as argument (returns array)
  / CommandTemplateArgument     // Template arguments ::...:: 
  / BacktickTemplateArgument    // Backtick templates `...`
  / NestedExecInvocation       // Nested function calls @func(args)
  / DataObjectLiteral           // Object literals: {"key": "value"}
  / ArrayLiteral                // Arrays: [1, 2, 3]
  / AlligatorExpression         // File loading: <file.md>
  / str:DataString {
      // Create a Text node directly - handle both simple strings and interpolated content
      if (typeof str === 'string') {
        return helpers.createNode(NodeType.Text, {
          content: str,
          location: location()
        });
      } else if (str.needsInterpolation) {
        // Return the parts for runtime interpolation
        return str.parts;
      }
    }
  / varRef:VariableNoTail {  // Use unified variable pattern for all contexts
      return varRef;
    }
  / PrimitiveValue       // Direct primitives: 42, true, false, null
  / EscapedArgument      // Escaped characters in unquoted arguments
  / RawArgument          // Fallback for unquoted arguments

// -------------------------------------------------------------
// UNIFIED ARGUMENT PATTERNS - From command-reference.peggy
// -------------------------------------------------------------

// Note: Individual argument patterns are defined in other grammar files.
// UnifiedArgument references existing patterns like NestedExecInvocation, 
// CommandTemplateArgument, etc. from their original locations.

// -------------------------------------------------------------
// CONTEXT VALIDATION AND COERCION
// -------------------------------------------------------------

// Consolidation complete - all patterns now use UnifiedArgumentList directly
