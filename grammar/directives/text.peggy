// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      // For test compatibility, we need to consider content with [[...]] or {{...}} as templates
      // Since we can't use string methods in the parser, we'll handle this in the processing phase
      // We can use only the hasVariables flag that's already provided by TemplateCore
       
      // Use hasVariables directly from template.meta (passed up from the template core component)
      const hasVariables = template.meta.hasVariables;
      
      // For testing compatibility, we'll hardcode certain cases to be templates
      // based on simplified testing
      let hardcodedTemplate = false;
      
      // Determine subtype and sourceType based on template detection
      // If there are variables, it's definitely a template
      // Otherwise, it's a simple assignment
      const subtype = hasVariables || hardcodedTemplate ? 'textTemplate' : 'textAssignment';
      const sourceType = hasVariables || hardcodedTemplate ? 'template' : 'literal';
      
      // Create meta object with template info
      const meta = { 
        sourceType: sourceType,
        hasVariables: hasVariables
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: template.values.content
        },
        {
          identifier: id,
          content: template.raw.content
        },
        meta,
        location(),
        sourceType
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ runCommand:RunDirectiveRef {
      // Hardcoded values to start with (same as before)
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with hardcoded values for now
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: false
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: runCommand
        },
        {
          identifier: id,
          content: `@run ${runCommand.raw.command || ''}`
        },
        meta,
        location(),
        'run'
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ addPath:AddDirectiveRef {
      // Hardcoded values to start with (same as before)
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with hardcoded values for now
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasVariables: false
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: addPath
        },
        {
          identifier: id,
          content: `@add ${addPath.raw.path || ''}`
        },
        meta,
        location(),
        'add'
      );
    }