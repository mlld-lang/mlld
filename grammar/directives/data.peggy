// DATA DIRECTIVE
// Implementation of the /data directive for defining data structures

/* 
# Data Directive

The data directive defines structured data objects and arrays.
It can be used in these forms:
1. /data varName = "string literal"              - Basic value assignment
2. /data varName = { "key": "value" }            - Object assignment
3. /data varName = [1, 2, 3]                     - Array assignment
4. /data varName = { nested: { prop: "value" } } - Nested structure
5. /data varName = @run command                  - Command output as data
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

// Primary /data directive
AtData
  = DirectiveContext "/data" _ "@" id:DottedIdentifier _ securityOptions:SecurityOptions? _ "=" _ value:DataValue {
      helpers.debug('AtData matched', { id, valueType: value.type });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // No need for separate raw capture - id is already a string
      
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
      } else if (value.type === "literalPath") {
        // Literal path content - array of content nodes
        values.value = value.value.parts;
      } else if (value.type === "execInvocation") {
        // Exec invocation with potential tail modifiers
        values.value = value.value;
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
        metaObj = { templateData: helpers.createTemplateMetadata(value.value, 'quote') };
      } else if (value.type === "variableReference") {
        source = 'variable';
        metaObj = { variableData: { 
          identifier: value.value.identifier,
          hasFieldAccess: !!(value.value.fields && value.value.fields.length > 0)
        } };
      } else if (value.type === "literalPath") {
        source = 'literalPath';
        metaObj = { literalPathData: { 
          raw: value.value.raw,
          hasVariables: value.value.parts.some(p => p.type === NodeType.VariableReference)
        } };
      } else if (value.type === "execInvocation") {
        source = 'exec';
        metaObj = { execInvocationData: {
          commandName: value.value.commandRef.name,
          hasArgs: value.value.commandRef.args && value.value.commandRef.args.length > 0,
          hasTailModifiers: !!value.value.withClause
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
      
      // Include security options in metadata if present
      if (securityOptions) {
        metaObj.security = securityOptions;
      }
      
      // Return the directive node
      return helpers.createStructuredDirective(
        'data',
        'dataAssignment',
        values,
        {},  // No raw field needed - values contain all necessary information
        metaObj,
        location(),
        source  // Use the determined source type
      );
    }

// -------------------------------------------------------------
// DATA VALUE TYPES
// -------------------------------------------------------------

// Any data value (object, array, primitive, directive, template, variable, literal path)
DataValue
  = ForeachSectionExpression    // New: foreach [@array.field # section] as [[template]]
  / ForeachCommandExpression    // Existing: foreach @command(@arrays)
  / DirectiveValue
  / VariableReferenceValue  // Must come before ExecInvocationValue to properly match field access
  / ExecInvocationValue
  / TemplateValue
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
  / LiteralPathValue
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

// Embedded directive value - semantic parsing for data context
DirectiveValue
  = "@run" _ directive:RunDirectiveRef {
      // Mark the directive as a data value
      if (directive.meta) {
        directive.meta.isDataValue = true;
      } else {
        directive.meta = { isDataValue: true };
      }
      
      return {
        type: "nestedDirective",
        directive: directive,
        rawText: "@run " + (directive.raw?.lang ? directive.raw.lang + " [" + (directive.raw.code || "") + "]" :
                           directive.raw?.command ? "[" + directive.raw.command + "]" :
                           directive.raw?.identifier ? "@" + directive.raw.identifier : "")
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

// Exec invocation with tail modifiers (without @run)
ExecInvocationValue
  = !ReservedDirective "@" invocation:ExecInvocationWithTail {
      return {
        type: "execInvocation",
        value: invocation,
        rawText: "@" + invocation.commandRef.name
      };
    }

// Variable reference (including field access) with proper disambiguation
VariableReferenceValue  
  = !ReservedDirective "@" id:BaseIdentifier !("(" / "[[") fields:AnyFieldAccess* tail:TailModifiers? {
      // Build the variable reference
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields && fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      // Check if this has tail modifiers
      if (tail) {
        // This is a variable with pipeline/tail modifiers
        return {
          type: "variableReferenceWithTail",
          value: {
            type: 'VariableReferenceWithTail',
            variable: varRef,
            withClause: tail
          },
          rawText: "@" + normalizedId,
          meta: {
            hasTailModifiers: true
          }
        };
      }
      
      // Plain variable reference without tail modifiers
      return {
        type: "variableReference",
        value: varRef,
        rawText: "@" + normalizedId + (fields ? fields.map(f => {
          if (f.type === 'field' || f.type === 'numericField' || f.type === 'stringIndex') {
            return '.' + f.value;
          } else if (f.type === 'arrayIndex') {
            return '[' + f.value + ']';
          }
          return '';
        }).join('') : '')
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
          // Handle literal paths
          else if (value.type === "literalPath") {
            result[key] = value.value.parts; // Array of content nodes
          }
          // Handle exec invocations
          else if (value.type === "execInvocation") {
            result[key] = value.value; // Exec invocation node
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
// Using standard list pattern from patterns/lists.peggy
DataObjectProperties
  = first:DataObjectProperty rest:(CommaSpace p:DataObjectProperty { return p; })* {
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
        } else if (item.type === "literalPath") {
          return item.value.parts; // Array of content nodes
        } else if (item.type === "execInvocation") {
          return item.value; // Exec invocation node
        } else {
          return item.value || item;
        }
      });
    }

// Array items list
// Using standard list pattern from patterns/lists.peggy
DataArrayItems
  = first:DataPropertyValue rest:(CommaSpace v:DataPropertyValue { return v; })* trailingComma:(_ ",")? {
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
      return helpers.createNode('Null', { value: null }, location());
    }
  / varRef:Variable { return varRef; }

// -------------------------------------------------------------
// LITERAL PATH VALUES
// -------------------------------------------------------------

// Literal path value for data objects (wrapped in brackets)
LiteralPathValue
  = "[" _ path:LiteralPathContent _ "]" {
      return {
        type: "literalPath",
        value: path,
        rawText: "[" + (path.raw || "") + "]"
      };
    }

// Content inside literal path brackets (excluding @ for variables)
LiteralPathContent
  = parts:LiteralPathPart+ {
      const raw = parts.map(p => {
        if (p.type === NodeType.Text) {
          return p.content;
        } else if (p.type === NodeType.VariableReference) {
          return '@' + p.identifier;
        }
        return p.content || p;
      }).join('');
      
      return {
        parts,
        raw
      };
    }

// Parts of a literal path (text or variable references)
LiteralPathPart
  = LiteralPathEscapedAt
  / LiteralPathVariableRef  
  / LiteralPathText

// Escaped @ symbol in literal path
LiteralPathEscapedAt
  = "\\@" {
      return helpers.createNode(NodeType.Text, { 
        content: '@', 
        location: location() 
      });
    }

// Variable reference in literal path
LiteralPathVariableRef
  = "@" varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('literalPath', { 
        identifier: varName,
        location: location()
      });
    }

// Regular text in literal path (everything except @, ], and newlines)
LiteralPathText
  = chars:$([^@\]\n]+) {
      return helpers.createNode(NodeType.Text, { 
        content: chars, 
        location: location() 
      });
    }

// Import foreach patterns from shared patterns
// See patterns/foreach.peggy for foreach functionality

// -------------------------------------------------------------
// DIRECTIVE REFERENCES
// -------------------------------------------------------------

// Command parts for data context - allows @var interpolation
DataCommandParts
  = parts:(DataCommandVariable / DataCommandText)* {
      return parts;
    }

// Variable in data command context
DataCommandVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable

// Text segments in data commands
DataCommandText
  = chars:$((!']' !'@' .)+) {
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }