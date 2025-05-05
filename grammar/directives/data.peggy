DataDirective
  = "data" _ id:Identifier  _ "=" _ value:DataValue HWS DirectiveEOL {
    helpers.debug('DATA', { type: 'assignment', identifier: id, valueType: value.type });
    
    // Capture raw text
    const rawIdentifier = id.toString ? id.toString() : JSON.stringify(id);
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
      // For primitive values, ensure it's a ContentNodeArray
      values.value = Array.isArray(value.value) ? value.value : [value.value];
    }
    
    // Determine the source based on the value type
    let source = null;
    if (value.type === "nestedDirective" && value.directive) {
      source = value.directive.subtype || 'directive';
    } else if (value.type === "object") {
      source = 'object';
    } else if (value.type === "array") {
      source = 'array';
    } else if (value.type === "literal") {
      source = 'literal';
    }
    
    // Return the directive node using createStructuredDirective
    return helpers.createStructuredDirective(
      'data',
      'dataAssignment',
      values,
      {
        identifier: rawIdentifier,
        value: rawValue
      },
      {},
      location(),
      source
    );
  }

DataValue
  = "@" addDirective:AddDirective {
      return {
        type: "nestedDirective",
        directive: addDirective, // Store the complete directive node
        rawText: "@add " + (addDirective.raw && addDirective.raw.path ? addDirective.raw.path : "")
      };
    }
  / "@" runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective, // Store the complete directive node
        rawText: "@run " + (runDirective.raw && runDirective.raw.command ? runDirective.raw.command : "")
      };
    }
  / value:DataObjectLiteral {
    return {
      type: "object",
      value,
      rawText: JSON.stringify(value, null, 2)
    };
  }
  / value:ArrayLiteral {
    return {
      type: "array",
      value,
      rawText: JSON.stringify(value, null, 2)
    };
  }
  / value:PrimitiveValue {
    return {
      type: "primitive",
      value,
      rawText: value.toString ? value.toString() : JSON.stringify(value)
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
  = "@" addDirective:AddDirective {
      return {
        type: "nestedDirective",
        directive: addDirective
      };
    }
  / "@" runDirective:RunDirective {
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
