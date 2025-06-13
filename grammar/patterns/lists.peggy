// Pattern: lists.peggy
// Purpose: Generic list parsing patterns for consistent list handling
// Used by: All directives that parse comma-separated lists
// NOTE: Peggy.js doesn't support parametric rules, so we'll create specific list patterns

// Common separator patterns
CommaSpace "comma with optional whitespace"
  = _ "," _

SemicolonSpace "semicolon with optional whitespace"
  = _ ";" _

// -------------------------------------------------------------
// ENVIRONMENT VARIABLE LIST
// -------------------------------------------------------------

// Environment variable list for @exec env = { ... }
// Parses comma-separated function names without @ prefix
EnvironmentVarList "environment variable list"
  = first:EnvironmentVarReference rest:(_ "," _ ref:EnvironmentVarReference { return ref; })* {
      return [first, ...rest];
    }

// Variable reference without @ prefix for environment declarations
EnvironmentVarReference "environment variable reference"  
  = name:BaseIdentifier {
      return helpers.createNode(NodeType.VariableReference, {
        identifier: name,
        valueType: 'identifier'
      }, location());
    }

// For now, we'll add specific list patterns as needed in directives
// Each directive will need to define its own list parsing using these separators
// Example pattern for reference:
// MyList = first:MyItem rest:(CommaSpace item:MyItem { return item; })* { return [first, ...rest]; }