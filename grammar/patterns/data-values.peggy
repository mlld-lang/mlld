// DATA VALUES - Specialized patterns for data context parsing
// Used by: /var directive when parsing objects and arrays
// Purpose: Create properly typed AST nodes with unwrapped primitive values

/*
# Data Context Patterns

This file provides specialized parsing patterns for data structures (objects and arrays)
that need:
1. Typed AST nodes ({type: 'object', properties: ...})
2. Unwrapped string values (plain strings, not wrapped in content arrays)
3. Preserved AST nodes for mlld expressions (variables, exec invocations, etc.)

The key difference from regular parsing:
- Regular: strings become {content: [...], wrapperType: '...'}
- Data: strings become plain JavaScript strings
*/

// DATA OBJECT LITERAL - Creates typed object nodes with entries
// This replaces ObjectLiteral in data context
DataObjectLiteral "data object literal"
  = "{" _ entries:DataObjectEntries? _ "}" {
      return {
        type: 'object',
        entries: entries || [],
        location: location()
      };
    }

// DATA OBJECT ENTRIES - Build entries array (pairs and spreads)
DataObjectEntries
  = first:DataObjectEntry rest:(_ "," _ entry:DataObjectEntry { return entry; })* _ ","? {
      return [first, ...rest];
    }

// DATA OBJECT ENTRY - Either a pair or a spread
DataObjectEntry
  = DataSpreadProperty
  / DataObjectPair

// DATA SPREAD PROPERTY - Spread syntax for objects
// Example: ...@user
DataSpreadProperty "spread property"
  = "..." variable:UnifiedVariableNoTail {
      return {
        type: 'spread',
        value: [variable]  // Wrap in array to match VariableNodeArray type
      };
    }

// DATA OBJECT PAIR - Key-value pair
DataObjectPair
  = key:PropertyKey optional:"?"? _ ":" _ value:DataPropertyValue {
      return {
        type: optional ? 'conditionalPair' : 'pair',
        key: key,
        value: value
      };
    }

// DATA PROPERTY VALUE - All valid RHS expressions with data-specific handling
// This mirrors ObjectPropertyValue but with key differences:
// 1. Uses DataObjectLiteral instead of ObjectLiteral (for typing)
// 2. Uses StringLiteral directly instead of TemplateStyleInterpolation (for unwrapping)
DataPropertyValue "data context property value"
  = RunCommandValue              // run {command} - preserve as-is
  / CodeExecutionValue           // js {code} - preserve as-is
  / DataObjectLiteral            // Nested objects get typed
  / ArrayLiteral                 // Arrays: [1, 2, 3] - always arrays!
  / AlligatorExpression          // File loading: <file.md> - always loading!
  / ExecResultMethodCall         // @func(args).method(args) - chained method calls
  / FieldAccessExecPattern       // @obj.method(args) - method calls on variables
  / ExecInvocationPattern        // @func() - preserve as-is
  / NestedDirective              // Other embedded directives - preserve as-is
  / DataTemplateValue            // Only bracket templates and backticks (not quotes)
  / DataStringValue              // Plain strings (unwrapped) - before expressions to avoid ! matching
  / ExpressionWithOperator       // Expressions with operators (ternary, comparison, etc.)
  / VariableWithTail             // @var with optional tail modifiers - preserve as-is
  / PrimitiveValue               // Numbers, booleans, null - AST Literal nodes

// DATA TEMPLATE VALUE - Only real templates (brackets and backticks)
// Excludes quoted strings which should be unwrapped in data context
DataTemplateValue "data template value"
  = content:InterpolatedTemplateContent {
      // InterpolatedTemplateContent returns the full template structure
      return {
        content: content,
        wrapperType: 'doubleBracket'
      };
    }
  / "`" parts:UnifiedBacktickInterpolation* "`" {
      // Backtick templates
      return {
        content: parts,
        wrapperType: 'backtick'
      };
    }

// DATA STRING VALUE - Returns unwrapped strings
// In data context, we want plain JavaScript strings, not AST nodes
DataStringValue "data context string value"
  = DataString                   // DataString handles both single and double quotes with interpolation

// DATA ARRAY CONTENT - Array items with proper data handling
DataArrayContent
  = first:DataArrayValue rest:(_ "," _ value:DataArrayValue { return value; })+ {
      return [first, ...rest];
    }
  / item:DataArrayValue _ "," {
      // Single item with trailing comma
      return [item];
    }

// DATA ARRAY VALUE - Similar to ArrayValue but uses data context patterns
DataArrayValue
  = RunCommandValue              // run {command} - preserve as-is
  / CodeExecutionValue           // js {code} - preserve as-is
  / DataObjectLiteral            // Objects get typed
  / ArrayLiteral                 // Arrays: [1, 2, 3] - always arrays!
  / AlligatorExpression          // File loading: <file.md> - always loading!
  / ExecResultMethodCall         // @func(args).method(args) - chained method calls
  / FieldAccessExecPattern       // @obj.method(args) - method calls on variables
  / ExecInvocationPattern        // @func() - preserve as-is
  / VariableWithTail             // @var with optional tail modifiers - preserve as-is
  / NestedDirective              // Other embedded directives - preserve as-is
  / DataTemplateValue            // Only bracket templates and backticks
  / DataStringValue              // Plain strings (unwrapped)
  / PrimitiveValue               // Numbers, booleans, null - AST Literal nodes

// Note: DataBracketAmbiguous removed - use ArrayLiteral for arrays, AlligatorExpression for file loading
