// ARRAY PATTERN - Clean Array Literals
// Syntax: [item1, item2, ...] 
// Purpose: ONLY creates arrays - no ambiguity with paths or sections

/*
# Array Pattern

Square brackets [] now ALWAYS mean arrays. No more guessing!

## Examples:
- [] - Empty array
- [1, 2, 3] - Number array
- ["a", "b", "c"] - String array
- [<file1.md>, <file2.md>] - Array of loaded file contents
- [@var1, @var2] - Array of variables
- [{ key: "value" }] - Array with object

## No Ambiguity:
- [file.md] is an array with one string "file.md"
- To load file content, use <file.md>
*/

// Array literal - always creates an array
ArrayLiteral "array literal"
  = "[" _ "]" { 
      helpers.debug('ArrayLiteral matched empty array');
      return { 
        type: 'array', 
        items: [],
        location: location()
      };
    }
  / "[" _ items:ArrayItems _ "]" {
      helpers.debug('ArrayLiteral matched with items', { itemCount: items.length });
      return { 
        type: 'array', 
        items: items,
        location: location()
      };
    }

// Array items with optional trailing comma
ArrayItems "array items"
  = first:ArrayValue rest:(_ "," _ value:ArrayValue { return value; })* _ ","? {
      return [first, ...rest];
    }

ConditionalArrayElement
  = varRef:ConditionalVariableReference {
      return {
        type: 'ConditionalArrayElement',
        condition: varRef.variable,
        value: varRef.variable,
        location: location()
      };
    }

// Values that can appear in arrays - all mlld data types
ArrayValue "array value"
  = AlligatorExpression     // <file.md> - load file content
  / ArrayLiteral            // nested arrays [1, [2, 3]]
  / DataObjectLiteral       // { key: value } objects
  / ExecInvocationPattern   // @func() execution
  / ConditionalArrayElement // @var? conditional element
  / VariableWithTail        // @var with modifiers
  / AtVar                   // @var references
  / UnifiedQuoteOrTemplate      // `template`, [[template]], "string" (replaces TemplateStyleInterpolation)
  / CodeExecution           // run {command} or js {code}
  / NestedDirective         // embedded directives
  / DataString              // 'string' or "string with @interpolation"
  / NumberLiteral           // 123
  / BooleanLiteral          // true/false
  / NullLiteral             // null
