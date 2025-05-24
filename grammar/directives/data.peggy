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

// Dotted identifier for nested property notation (e.g., greeting.text)
DottedIdentifier "Dotted Identifier"
  = first:BaseIdentifier rest:("." id:BaseIdentifier { return "." + id; })* {
      return first + rest.join('');
    }

// Primary @data directive
AtData
  = DirectiveContext "@data" _ id:DottedIdentifier _ "=" _ value:DataValue {
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
      } else if (value.type === "template") {
        // Template content - array of content nodes
        values.value = value.value;
      } else if (value.type === "variableReference") {
        // Variable reference - wrap in array
        values.value = [value.value];
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
      } else if (value.type === "template") {
        source = 'template';
        metaObj = { templateData: { hasVariables: value.value.some(part => 
          part && part.type === NodeType.VariableReference
        ) } };
      } else if (value.type === "variableReference") {
        source = 'variable';
        metaObj = { variableData: { 
          identifier: value.value.identifier,
          hasFieldAccess: !!(value.value.fields && value.value.fields.length > 0)
        } };
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
        } else if (primitiveValue && primitiveValue.type === NodeType.Null) {
          metaObj = { primitiveType: 'null' };
        } else if (primitiveValue && primitiveValue.type === NodeType.VariableReference) {
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

// Any data value (object, array, primitive, directive, template, variable)
DataValue
  = DirectiveValue
  / TemplateValue  
  / VariableReferenceValue
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

// Embedded directive value - using core patterns directly for data context
DirectiveValue
  = "@run" _ command:CommandCore {
      const runDirective = helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        { 
          ...command.meta, 
          isDataValue: true,
          isMultiLine: command.raw.command.includes('\n')
        },
        location()
      );
      
      return {
        type: "nestedDirective",
        directive: runDirective,
        rawText: "@run " + (command.raw && command.raw.command ? command.raw.command : "")
      };
    }
  / "@run" _ exec:RunExecCore {
      const runDirective = helpers.createStructuredDirective(
        'run',
        'runExec',
        exec.values,
        exec.raw,
        {
          ...exec.meta,
          isDataValue: true
        },
        location(),
        'exec'
      );
      
      return {
        type: "nestedDirective",
        directive: runDirective,
        rawText: "@run @" + exec.raw.identifier
      };
    }
  / "@add" _ content:AddCore {
      // Map the core type to the appropriate directive subtype
      const subtypeMap = {
        'addPath': 'addPath',
        'addTemplate': 'addTemplate',
        'addVariable': 'addVariable',
        'addTemplateInvocation': 'addTemplateInvocation',
        'addPathSection': 'addPathSection'
      };
      
      const subtype = subtypeMap[content.type] || 'add';
      
      const addDirective = helpers.createStructuredDirective(
        'add',
        subtype,
        content.values,
        content.raw,
        {
          ...content.meta,
          isDataValue: true
        },
        location(),
        content.type === 'addPath' ? 'path' : 
        content.type === 'addTemplate' ? 'template' :
        content.type === 'addVariable' ? 'variable' :
        content.type === 'addTemplateInvocation' ? 'templateInvocation' :
        'section'
      );
      
      return {
        type: "nestedDirective",
        directive: addDirective,
        rawText: "@add " + (content.raw && content.raw.path ? content.raw.path : 
                   content.raw && content.raw.content ? content.raw.content :
                   content.raw && content.raw.variable ? content.raw.variable :
                   content.raw && content.raw.templateName ? 
                     "@" + content.raw.templateName + "(" + (content.raw.arguments || []).join(", ") + ")" :
                   "")
      };
    }

// Variable reference (including field access) with proper disambiguation
VariableReferenceValue  
  = !ReservedDirective "@" id:BaseIdentifier accessElements:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(accessElements.length > 0 ? { fields: accessElements } : {})
      }, location());
      
      return {
        type: "variableReference",
        value: node,
        rawText: "@" + normalizedId + (accessElements ? accessElements.map(f => 
          f.type === 'dotAccess' ? '.' + f.field : '[' + f.index + ']'
        ).join('') : '')
      };
    }

// Inline template value - using existing template core
TemplateValue
  = content:WrappedTemplateContent {
      return {
        type: "template",
        value: content.parts,
        rawText: content.raw
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
          // Handle template values
          else if (value.type === "template") {
            result[key] = value.value; // Array of content nodes
          }
          // Handle variable references
          else if (value.type === "variableReference") {
            result[key] = value.value; // Variable reference node
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
  = value:DataValue {
      return value;
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
        } else if (item.type === "template") {
          return item.value; // Array of content nodes
        } else if (item.type === "variableReference") {
          return item.value; // Variable reference node
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
  / NullLiteral { 
      // Return a proper node instead of raw null to avoid AST processing errors
      return helpers.createNode(NodeType.Null, { value: null }, location());
    }
  / varRef:Variable { return varRef; }

// -------------------------------------------------------------
// DIRECTIVE REFERENCES
// -------------------------------------------------------------