// FIELD ACCESS PATTERNS
// This file defines patterns for accessing fields and array elements
// These patterns are used for variable field access, object property access,
// and array indexing across various contexts.

/* Import base definitions */

// DOT NOTATION FIELD ACCESS
// Example: obj.property, var.field
FieldAccess
  = DotSeparator fieldStart:("" { return peg$currPos; }) field:BaseIdentifier {
      return { 
        type: 'field', 
        value: field,
        location: {
          start: {
            offset: fieldStart,
            line: location().start.line,
            column: location().start.column + 1
          },
          end: location().end
        }
      };
    }

// NUMERIC FIELD ACCESS
// Example: obj.123, var.456 
// Allows direct property access with numeric indices
NumericFieldAccess
  = DotSeparator fieldStart:("" { return peg$currPos; }) index:NumberLiteral {
      return { 
        type: 'numericField', 
        value: index,
        location: {
          start: {
            offset: fieldStart,
            line: location().start.line,
            column: location().start.column + 1
          },
          end: location().end
        }
      };
    }

// ARRAY INDEXING WITH BRACKETS
// Example: array[0], list[index], obj["key-with-spaces"]
ArrayAccess
  = "[" _ index:NumberLiteral _ "]" {
      return { 
        type: 'arrayIndex', 
        value: index,
        location: location()
      };
    }
  / "[" _ index:StringLiteral _ "]" {
      return { 
        type: 'bracketAccess', 
        value: index,
        location: location()
      };
    }
  / "[" _ "@" index:BaseIdentifier _ "]" {
      return { 
        type: 'variableIndex', 
        value: index,
        location: location()
      };
    }
  / "[" _ index:BaseIdentifier _ "]" {
      return { 
        type: 'stringIndex', 
        value: index,
        location: location()
      };
    }

// COMBINED FIELD ACCESS
// Represents any type of field access (to be used in combined patterns)
AnyFieldAccess
  = FieldAccess
  / NumericFieldAccess
  / ArrayAccess