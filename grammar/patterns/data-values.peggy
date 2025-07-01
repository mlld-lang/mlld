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

// DATA OBJECT LITERAL - Creates typed object nodes
// This replaces ObjectLiteral in data context
DataObjectLiteral "data object literal"
  = "{" _ props:DataObjectProperties? _ "}" {
      return helpers.createObjectFromProperties(props, location());
    }

// DATA OBJECT PROPERTIES - Build property map
DataObjectProperties
  = first:DataObjectProperty rest:(_ "," _ p:DataObjectProperty { return p; })* {
      const result = {};
      for (const [key, value] of [first, ...rest]) {
        result[key] = value;
      }
      return result;
    }

// DATA OBJECT PROPERTY - Key-value pair
DataObjectProperty
  = key:PropertyKey _ ":" _ value:DataPropertyValue {
      return [key, value];
    }

// DATA PROPERTY VALUE - All valid RHS expressions with data-specific handling
// This mirrors ObjectPropertyValue but with key differences:
// 1. Uses DataObjectLiteral instead of ObjectLiteral (for typing)
// 2. Uses StringLiteral directly instead of TemplateStyleInterpolation (for unwrapping)
DataPropertyValue "data context property value"
  = RunCommandValue              // run {command} - preserve as-is
  / CodeExecutionValue           // js {code} - preserve as-is  
  / DataObjectLiteral            // Nested objects get typed
  / DataBracketAmbiguous         // Arrays OR file paths - data context version
  / ExecInvocationPattern        // @func() - preserve as-is
  / VariableWithTail             // @var with optional tail modifiers - preserve as-is
  / NestedDirective              // Other embedded directives - preserve as-is
  / DataTemplateValue            // Only bracket templates and backticks (not quotes)
  / DataStringValue              // Plain strings (unwrapped)
  / PrimitiveValue               // Numbers, booleans, null - preserve as-is

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
  / "`" parts:BacktickInterpolation* "`" {
      // Backtick templates
      return {
        content: parts,
        wrapperType: 'backtick'
      };
    }

// DATA STRING VALUE - Returns unwrapped strings
// In data context, we want plain JavaScript strings, not AST nodes
DataStringValue "data context string value"
  = StringLiteral                // StringLiteral already returns unwrapped content!

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
  / DataBracketAmbiguous         // Arrays OR paths - use ambiguous version for consistency
  / ExecInvocationPattern        // @func() - preserve as-is
  / VariableWithTail             // @var with optional tail modifiers - preserve as-is
  / NestedDirective              // Other embedded directives - preserve as-is
  / DataTemplateValue            // Only bracket templates and backticks
  / DataStringValue              // Plain strings (unwrapped)
  / PrimitiveValue               // Numbers, booleans, null - preserve as-is

// Note: DataBracketArray removed - use DataBracketAmbiguous for consistency
// This ensures proper array vs path disambiguation at all nesting levels

// DATA BRACKET AMBIGUOUS - Data context version of BracketAmbiguous
// Handles array vs path disambiguation with data context array parsing
DataBracketAmbiguous "data bracket content (array or path)"
  = "[" _ "]" {
      // Empty brackets - treat as empty array
      return helpers.createEmptyArray(location());
    }
  / "[" _ "," _ "]" {
      // Explicit empty array syntax
      return helpers.createEmptyArray(location());
    }
  / "[" _ content:DataBracketContentWithComma _ "]" {
      // Has comma = array with data context parsing
      return helpers.createArrayFromContent(content, location());
    }
  / "[" _ content:BracketContentWithSection _ "]" {
      // Has # = section extraction (no change needed)
      return helpers.createSectionExtraction(content, location());
    }
  / "[" _ value:DataArrayValue _ "]" {
      // Single array value (object, array, string, etc.) = array with one element
      return helpers.createArrayFromContent([value], location());
    }
  / "[" _ content:BracketContentSimple _ "]" {
      // No comma, no # = file path (no change needed)
      return helpers.createPathDereference(content, location());
    }

// DATA BRACKET CONTENT WITH COMMA - Uses data context array values
DataBracketContentWithComma
  = first:DataArrayValue rest:(_ "," _ value:DataArrayValue { return value; })+ {
      return [first, ...rest];
    }
  / item:DataArrayValue _ "," {
      // Single item with trailing comma
      return [item];
    }