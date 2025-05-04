DataDirective
  = "data" _ id:Identifier  _ "=" _ value:DataValue HWS DirectiveEOL {
    helpers.debug('DATA', { type: 'assignment', identifier: id, valueType: value.type });
    
    // Capture raw text
    const rawIdentifier = $(id);
    const rawValue = value.rawText || '';
    
    // Create structured values object
    const values = {
      identifier: [id]
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
      // For primitive values, use content nodes array
      values.value = value.value;
    }
    
    // Return the directive node
    return {
      type: 'Directive',
      kind: 'data',
      subtype: 'dataAssignment',
      values,
      raw: {
        identifier: rawIdentifier,
        value: rawValue
      },
      meta: {}
    };
  }

DataValue
  = embedDirective:EmbedDirective {
      return {
        type: "nestedDirective",
        directive: embedDirective, // Store the complete directive node
        rawText: $(embedDirective)
      };
    }
  / runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective, // Store the complete directive node
        rawText: $(runDirective)
      };
    }
  / value:DataObjectLiteral {
    return {
      type: "object",
      value,
      rawText: $(value)
    };
  }
  / value:ArrayLiteral {
    return {
      type: "array",
      value,
      rawText: $(value)
    };
  }
  / value:PrimitiveValue {
    return {
      type: "primitive",
      value,
      rawText: $(value)
    };
  }

// Primitive values (string, number, boolean, null)
PrimitiveValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / varExpr:Variable { return varExpr; }

DataObjectLiteral
  = "{" _ props:ObjectProperties? _ "}" {
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

ObjectProperties
  = first:ObjectProperty rest:(_ "," _ p:ObjectProperty { return p; })* {
    return [first, ...rest];
  }

ObjectProperty
  = key:PropertyKey _ ":" _ value:PropertyValue {
    return [key, value];
  }

PropertyKey
  = id:Identifier { return id.identifier || id; }
  / str:StringLiteral { return str; }

PropertyValue
  = embedDirective:EmbedDirective {
      return {
        type: "nestedDirective",
        directive: embedDirective
      };
    }
  / runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective
      };
    }
  / value:DataObjectLiteral {
    return {
      type: "object",
      value
    };
  }
  / value:ArrayLiteral {
    return {
      type: "array",
      value
    };
  }
  / value:PrimitiveValue {
    return {
      type: "primitive",
      value
    };
  }

ArrayLiteral
  = "[" _ items:ArrayItems? _ "]" {
    return processArrayItems(items || []);
  }

// Process array items to handle nested directives, objects, and arrays
function processArrayItems(items) {
  return items.map(item => {
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

ArrayItems
  = first:PropertyValue rest:(_ "," _ v:PropertyValue { return v; })* trailingComma:(_ ",")? {
    return [first, ...rest];
  }

FieldAccess
  = "." field:Identifier {
    return { type: 'field', value: field };
  }

NumericFieldAccess
  = "." index:NumericIndentifier {
    return { type: 'index', value: parseInt(index, 10) };
  }

NumericIndentifier
  = digits:[0-9]+ {
    return digits.join('');
  }

ArrayAccess
  = "[" index:(NumberLiteral / StringLiteral / Identifier) "]" {
    return { type: 'index', value: index };
  }
