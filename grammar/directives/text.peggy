TextDirective
  = textAssignment

// Content rule for templates with variable interpolation support
TemplatePlainContent
  = parts:(InterpolationVar / TemplateTextSegment)* {
      helpers.debug('TemplatePlainContent matched with parts', { 
        partsLength: parts.length, 
        firstType: parts.length > 0 ? parts[0].type : 'none' 
      });
      return parts;
    }

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
    
    // Determine source for the top-level field and which directive type to use
    let sourceType = 'literal'; // Default source type
    let directiveType = 'textAssignment'; // Default directive type
    
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
    } else if (value.type === "template") {
      // Use the template values for content
      values.content = value.values;
      sourceType = 'template';
      directiveType = 'textTemplate'; // Use textTemplate for template type values
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
      directiveType,
      values,
      raw,
      meta,
      location(),
      sourceType
    );
  }

// Template handling is now done inside textAssignment

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
  / '[[' content:TemplatePlainContent ']]' {
      helpers.debug('Found template value with double brackets');
      // This is a template, call textTemplate rule
      return {
        type: "template",
        values: content,
        rawText: "[[" + helpers.reconstructRawString(content) + "]]"
      };
    }
  / textContent:WrappedTemplateContent {
      return {
        type: "literal",
        values: textContent.parts,
        rawText: textContent.raw
      };
    }
