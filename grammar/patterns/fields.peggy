// FIELD ACCESS PATTERNS
// This file defines patterns for accessing fields and array elements
// These patterns are used for variable field access, object property access,
// and array indexing across various contexts.

/* Import base definitions */

// DOT NOTATION FIELD ACCESS
// Example: obj.property, var.field
FieldAccess
  = DotSeparator field:BaseIdentifier {
      return { type: 'field', value: field };
    }

// NUMERIC FIELD ACCESS
// Example: obj.123, var.456 
// Allows direct property access with numeric indices
NumericFieldAccess
  = DotSeparator index:NumberLiteral {
      return { type: 'numericField', value: index };
    }

// ARRAY INDEXING WITH BRACKETS
// Example: array[0], list[index]
ArrayAccess
  = "[" _ index:NumberLiteral _ "]" {
      return { type: 'arrayIndex', value: index };
    }
  / "[" _ index:BaseIdentifier _ "]" {
      return { type: 'stringIndex', value: index };
    }

// COMBINED FIELD ACCESS
// Represents any type of field access (to be used in combined patterns)
AnyFieldAccess
  = FieldAccess
  / NumericFieldAccess
  / ArrayAccess