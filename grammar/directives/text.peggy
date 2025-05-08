// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      // Get hasVariables flag directly from the template's meta
      const hasVariables = template.meta.hasVariables;
      
      // Determine the subtype based on whether the template has variables
      const subtype = hasVariables ? 'textTemplate' : 'textAssignment';
      
      // Set source type based on whether it's a template
      const sourceType = hasVariables ? 'template' : 'literal';
      
      // Create meta object 
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