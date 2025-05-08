// DATA DIRECTIVE
// Implementation of the @data directive for defining data structures

/* 
# Data Directive

The data directive defines structured data objects and arrays.
It can be used in these forms:
1. @data varName = "string literal"              - Basic value assignment
2. @data varName = { "key": "value" }            - Object assignment
3. @data varName = [1, 2, 3]                     - Array assignment
4. @data varName = { nested: { prop: "value" } } - Nested structure
5. @data varName = @run command                  - Command output as data
*/

// Core content handlers (context, tokens, literals, whitespace, variables, fields, directives)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL DATA DIRECTIVE
// -------------------------------------------------------------

// Primary @data directive
AtData
  = DirectiveContext "@data" _ id:BaseIdentifier _ "=" _ value:DataValue {
      helpers.debug('AtData matched', { id, valueType: value.type });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Capture raw text
      const rawIdentifier = id;
      const rawValue = value.rawText || '';
      
      // Create structured values object
      const values = {
        identifier: [idNode]
      };
      
      // Handle different types of values
      if (value.type === "nestedDirective" && value.directive) {
        // Use the full directive node directly
        values.value = value.directive;
      } else if (value.type === "object") {
        // Create a data object structure with nested properties
        values.value = {
          type: 'object',
          properties: value.value
        };
      } else if (value.type === "array") {
        // Create a data array structure
        values.value = {
          type: 'array',
          items: value.value
        };
      } else {
        // For primitive values, ensure it's a ContentNodeArray
        values.value = Array.isArray(value.value) ? value.value : [value.value];
      }
      
      // Determine the source based on the value type
      let source = null;
      let metaObj = {};
      
      if (value.type === "nestedDirective" && value.directive) {
        source = value.directive.subtype || 'directive';
        metaObj = { nestedDirective: { kind: value.directive.kind } };
      } else if (value.type === "object") {
        source = 'object';
        metaObj = { objectData: { propCount: Object.keys(value.value).length } };
      } else if (value.type === "array") {
        source = 'array';
        metaObj = { arrayData: { itemCount: value.value.length } };
      } else if (value.type === "primitive") {
        source = 'literal';
        // Detect the specific primitive type
        const primitiveValue = value.value;
        if (typeof primitiveValue === 'string') {
          metaObj = { primitiveType: 'string' };
        } else if (typeof primitiveValue === 'number') {
          metaObj = { primitiveType: 'number' };
        } else if (typeof primitiveValue === 'boolean') {
          metaObj = { primitiveType: 'boolean' };
        } else if (primitiveValue === null) {
          metaObj = { primitiveType: 'null' };
        } else if (primitiveValue.type === NodeType.VariableReference) {
          metaObj = { primitiveType: 'variable' };
        }
      }
      
      // Return the directive node
      return helpers.createStructuredDirective(
        'data',
        'dataAssignment',
        values,
        {
          identifier: rawIdentifier,
          value: rawValue
        },
        metaObj,
        location(),
        source  // Use the determined source type
      );
    }

// -------------------------------------------------------------
// DATA VALUE TYPES
// -------------------------------------------------------------

// Any data value (object, array, primitive, directive)
DataValue
  = "@run" _ runDirective:RunDirectiveRef {
      return {
        type: "nestedDirective",
        directive: runDirective,
        rawText: "@run " + (runDirective.raw && runDirective.raw.command ? runDirective.raw.command : "")
      };
    }
  / "@add" _ addDirective:AddDirectiveRef {
      return {
        type: "nestedDirective",
        directive: addDirective,
        rawText: "@add " + (addDirective.raw && addDirective.raw.path ? addDirective.raw.path : "")
      };
    }
  / object:DataObjectLiteral {
      return {
        type: "object",
        value: object,
        rawText: JSON.stringify(object, null, 2)
      };
    }
  / array:DataArrayLiteral {
      return {
        type: "array",
        value: array,
        rawText: JSON.stringify(array, null, 2)
      };
    }
  / value:DataPrimitiveValue {
      const rawText = typeof value === 'object' && value.type === NodeType.VariableReference ?
                     `@${value.identifier}` :
                     value === null ? 'null' : JSON.stringify(value);
      
      return {
        type: "primitive",
        value,
        rawText
      };
    }

// -------------------------------------------------------------
// OBJECT LITERALS
// -------------------------------------------------------------

// Object literal with properties
DataObjectLiteral
  = "{" _ props:DataObjectProperties? _ "}" {
      const result = {};
      
      // Process properties into a structured format
      if (props) {
        for (const [key, value] of props) {
          // Handle nested directives
          if (value.type === "nestedDirective" && value.directive) {
            result[key] = value.directive;
          } 
          // Handle nested objects
          else if (value.type === "object") {
            result[key] = {
              type: 'object',
              properties: value.value
            };
          } 
          // Handle nested arrays
          else if (value.type === "array") {
            result[key] = {
              type: 'array',
              items: value.value
            };
          } 
          // Handle primitive values
          else {
            result[key] = value.value || value;
          }
        }
      }
      
      return result;
    }

// Object properties list
DataObjectProperties
  = first:DataObjectProperty rest:(_ "," _ p:DataObjectProperty { return p; })* {
      return [first, ...rest];
    }

// Single object property (key-value pair)
DataObjectProperty
  = key:DataPropertyKey _ ":" _ value:DataPropertyValue {
      return [key, value];
    }

// Property key (string or identifier)
DataPropertyKey
  = id:BaseIdentifier { return id; }
  / str:StringLiteral { return str; }

// Property value (can be any data value)
DataPropertyValue
  = "@run" _ runDirective:RunDirectiveRef {
      return {
        type: "nestedDirective",
        directive: runDirective
      };
    }
  / "@add" _ addDirective:AddDirectiveRef {
      return {
        type: "nestedDirective",
        directive: addDirective
      };
    }
  / value:DataObjectLiteral {
      return {
        type: "object",
        value
      };
    }
  / value:DataArrayLiteral {
      return {
        type: "array",
        value
      };
    }
  / value:DataPrimitiveValue {
      return {
        type: "primitive",
        value
      };
    }

// -------------------------------------------------------------
// ARRAY LITERALS
// -------------------------------------------------------------

// Array literal with items
DataArrayLiteral
  = "[" _ items:DataArrayItems? _ "]" {
      const itemsArray = items || [];
      return itemsArray.map(item => {
        if (item.type === "nestedDirective" && item.directive) {
          return item.directive;
        } else if (item.type === "object") {
          return {
            type: 'object',
            properties: item.value
          };
        } else if (item.type === "array") {
          return {
            type: 'array',
            items: item.value
          };
        } else {
          return item.value || item;
        }
      });
    }

// Array items list
DataArrayItems
  = first:DataPropertyValue rest:(_ "," _ v:DataPropertyValue { return v; })* trailingComma:(_ ",")? {
      return [first, ...rest];
    }

// -------------------------------------------------------------
// PRIMITIVE VALUES
// -------------------------------------------------------------

// Primitive value (string, number, boolean, null, variable)
DataPrimitiveValue
  = value:StringLiteral { return value; }
  / value:NumberLiteral { return value; }
  / value:BooleanLiteral { return value; }
  / value:NullLiteral { return value; }
  / varRef:Variable { return varRef; }

// -------------------------------------------------------------
// DIRECTIVE REFERENCES
// -------------------------------------------------------------