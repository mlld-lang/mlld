TextDirective
  = textAssignment / textTemplate

textAssignment
  = "text" _ id:Identifier _ "=" _ value:TextValue HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'assignment', identifier: id, valueSource: value.type });
    
    // Capture raw text
    const rawIdentifier = $(id);
    const rawContent = value.rawText || '';
    
    // Create structured values object
    const values = {
      identifier: [id]
    };
    
    // Check if the value is a nested directive
    if (value.type === "nestedDirective" && value.directive) {
      // Use the full directive node directly in the content field
      values.content = value.directive;
      values.source = 'directive'; // Mark this as having a directive source
    } else {
      // Use normal values array for non-directive content
      values.content = value.values;
      
      if (value.type) {
        values.source = value.type;
      }
    }
    
    // Create structured raw object
    const raw = {
      identifier: rawIdentifier,
      content: rawContent
    };
    
    // Create structured meta object
    const meta = {};
    
    // Add specific metadata based on type (for backward compatibility)
    if (value.type === "embed" && value.embed) {
      meta.embed = value.embed;
    } else if (value.type === "run" && value.run) {
      meta.run = value.run;
    }
    
    return {
      type: 'Directive',
      kind: 'text',
      subtype: 'textAssignment',
      values,
      raw,
      meta
    };
  }

textTemplate
  = "text" _ id:(Identifier _ "=" _)? "[" content:BracketInterpolatableContent "]" HWS DirectiveEOL {
    // Parse identifier if present
    const identifier = id ? id[0] : null;
    helpers.debug('TEXT', { type: 'template', identifier, content });
    
    // Capture raw text
    const rawIdentifier = identifier ? $(identifier) : undefined;
    const rawContent = $(content);
    
    // Create values object with optional identifier
    const values = {
      content: content
    };
    
    if (identifier) {
      values.identifier = [identifier];
    }
    
    return {
      type: 'Directive',
      kind: 'text',
      subtype: 'textTemplate',
      values,
      raw: {
        identifier: rawIdentifier,
        content: rawContent
      },
      meta: {}
    };
  }

TextValue
  = embedDirective:EmbedDirective {
      return {
        type: "nestedDirective",
        directive: embedDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: $(embedDirective)
      };
    }
  / runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: $(runDirective)
      };
    }
  / value:InterpolatedStringLiteral {
      return {
        type: "literal",
        values: value,
        rawText: $(value)
      };
    }
  / value:InterpolatedMultilineTemplate {
      return {
        type: "literal",
        values: value,
        rawText: $(value)
      };
    }
