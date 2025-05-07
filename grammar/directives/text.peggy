TextDirective
  = textAssignment / textTemplate

textAssignment
  = "text" _ id:Identifier _ "=" _ value:TextValue HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'assignment', identifier: id, valueSource: value.type });
    
    // Create variable reference node for identifier
    const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
    const rawIdentifier = id;
    const rawContent = value.rawText || '';
    
    // Create structured values object
    const values = {
      identifier: [idNode]
    };
    
    // Create structured meta object
    const meta = {};
    
    // Determine source for the top-level field
    let sourceType = 'literal'; // Default source type
    
    // Check if the value is a nested directive
    if (value.type === "nestedDirective" && value.directive) {
      // Use the full directive node directly in the content field
      values.content = value.directive;
      
      // Set source and populate meta based on directive type
      if (value.directive.kind === 'run') {
        sourceType = 'run';
        meta.run = { type: value.directive.subtype };
      } else if (value.directive.kind === 'add') {
        sourceType = 'add';
        meta.add = { type: value.directive.subtype };
      } else {
        sourceType = value.directive.kind || 'directive';
      }
    } else {
      // Use normal values array for non-directive content
      values.content = Array.isArray(value.values) ? value.values : [value.values];
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
  = "text" _ id:(Identifier _ "=" _)? content:WrappedTemplateContent HWS DirectiveEOL {
    // Parse identifier if present
    const identifier = id ? id[0] : null;
    helpers.debug('TEXT', { type: 'template', identifier, content });
    
    // Capture raw text
    const rawIdentifier = identifier;
    const rawContent = content.raw;
    
    // Create values object with optional identifier
    const values = {
      content: content.parts
    };
    
    if (identifier) {
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: identifier });
      values.identifier = [idNode];
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
  / textContent:WrappedTemplateContent {
      return {
        type: "literal",
        values: textContent.parts,
        rawText: textContent.raw
      };
    }
