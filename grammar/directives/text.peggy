TextDirective
  = textAssignment / textTemplate

textAssignment
  = "text" _ id:Identifier _ "=" _ value:TextValue HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'assignment', identifier: id, valueSource: value.type });
    
    // Capture raw text - use the identifier toString() method instead of $()
    const rawIdentifier = id.toString ? id.toString() : JSON.stringify(id);
    const rawContent = value.rawText || '';
    
    // Create structured values object
    const values = {
      identifier: [id]
    };
    
    // Create structured meta object
    const meta = {};
    
    // Determine source for the top-level field
    let sourceType = null;
    
    // Check if the value is a nested directive
    if (value.type === "nestedDirective" && value.directive) {
      // Use the full directive node directly in the content field
      values.content = value.directive;
      
      // Set source to the nested directive's subtype
      sourceType = value.directive.subtype || 'directive';
    } else {
      // Use normal values array for non-directive content
      values.content = Array.isArray(value.values) ? value.values : [value.values];
      
      // Set source based on the value type
      if (value.type) {
        sourceType = value.type;
      }
    }
    
    // Create structured raw object
    const raw = {
      identifier: rawIdentifier,
      content: rawContent
    };
    
    // Return using createStructuredDirective for consistency
    return helpers.createStructuredDirective(
      'text',
      'textAssignment',
      values,
      raw,
      meta,
      location(),
      sourceType
    );
  }

textTemplate
  = "text" _ id:(Identifier _ "=" _)? "[" content:BracketInterpolatableContent "]" HWS DirectiveEOL {
    // Parse identifier if present
    const identifier = id ? id[0] : null;
    helpers.debug('TEXT', { type: 'template', identifier, content });
    
    // Capture raw text
    const rawIdentifier = identifier ? (identifier.toString ? identifier.toString() : JSON.stringify(identifier)) : undefined;
    const rawContent = content.map(item => item.content || (item.toString ? item.toString() : JSON.stringify(item))).join('');
    
    // Create values object with optional identifier
    const values = {
      content: Array.isArray(content) ? content : [content]
    };
    
    if (identifier) {
      values.identifier = [identifier];
    }
    
    // Create raw object
    const raw = {
      identifier: rawIdentifier,
      content: rawContent
    };
    
    // Create meta object
    const meta = {};
    
    // Return using createStructuredDirective for consistency
    return helpers.createStructuredDirective(
      'text',
      'textTemplate',
      values,
      raw,
      meta,
      location(),
      'template'  // Using 'template' as the source for interpolatable content
    );
  }

TextValue
  = "@" addDirective:AddDirective {
      return {
        type: "nestedDirective",
        directive: addDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@add " + (addDirective.raw && addDirective.raw.path ? addDirective.raw.path : "")
      };
    }
  / "@" runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@run " + (runDirective.raw && runDirective.raw.command ? runDirective.raw.command : "")
      };
    }
  / value:InterpolatedStringLiteral {
      return {
        type: "literal",
        values: value,
        // Join the content from each node in the array
        rawText: value.map(item => item.content || '').join('')
      };
    }
  / value:InterpolatedMultilineTemplate {
      return {
        type: "literal",
        values: value,
        // Join the content from each node in the array
        rawText: value.map(item => item.content || '').join('')
      };
    }
