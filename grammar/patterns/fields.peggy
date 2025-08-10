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
// Extended to support slice operations [0:5] and filter operations [?field>100]
// Example: array[0], list[index], obj["key-with-spaces"], array[0:5], array[?size>100]
ArrayAccess
  = SliceOperation      // MUST contain ':' 
  / FilterOperation     // MUST start with '?'
  / ExistingArrayIndex  // Everything else (existing patterns)

// Slice operations - ':' is required
SliceOperation
  = "[" _ start:SliceIndex? _ ":" _ end:SliceIndex? _ "]" {
      return {
        type: 'arraySlice',
        start: start !== undefined ? start : null,
        end: end !== undefined ? end : null,
        location: location()
      };
    }

// Support negative indices (only used in slice operations)
SliceIndex
  = sign:"-"? num:NumberLiteral {
      return sign ? -num : num;
    }

// Filter operations - '?' is required
FilterOperation
  = "[" _ "?" _ condition:FilterCondition _ "]" {
      return {
        type: 'arrayFilter',
        condition: condition,
        location: location()
      };
    }

// Filter conditions (in order of precedence)
FilterCondition
  = field:FilterField _ "~" _ value:StringLiteral {
      // String contains operator
      return { field, operator: '~', value };
    }
  / field:FilterField _ op:FilterComparisonOp _ value:FilterValue {
      // Use FilterComparisonOp which allows '=' as shorthand
      return { field, operator: op, value };
    }
  / field:FilterField {
      // Existence/truthy check
      return { field };
    }

// Support nested field access (e.g., fm.draft, metadata.author)
FilterField
  = first:BaseIdentifier rest:("." id:BaseIdentifier { return id; })* {
      return rest.length > 0 ? [first, ...rest] : first;
    }

// Extended comparison operators for filter context
// Allows '=' as shorthand for '==' in filters for brevity
FilterComparisonOp
  = "=" !"=" { return '=='; }  // Single '=' means equality in filters
  / "==" { return '=='; }
  / "!=" { return '!='; }
  / "<=" { return '<='; }
  / ">=" { return '>='; }
  / "<" !"=" { return '<'; }
  / ">" !"=" { return '>'; }

// Filter values can be literals, durations, or variable references
FilterValue
  = StringLiteral
  / TimeDurationLiteral  // Time durations: 90m, 12h, 7d, 2w, 1y
  / NumberLiteral
  / BooleanLiteral
  / AtVarInFilter  // Variable reference in filter context

// Variable reference in filter context now uses unified core directly
AtVarInFilter = UnifiedAtVar

// Keep existing array index patterns
ExistingArrayIndex
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