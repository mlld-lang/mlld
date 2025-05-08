// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      // Hardcoded values to start with (same as before)
      const subtype = 'textAssignment';
      const sourceType = 'literal';
      
      // Create meta object with hardcoded values for now
      const meta = { 
        sourceType: sourceType,
        hasVariables: false
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
      return helpers.createStructuredDirective(
        'text',
        'textAssignment',
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: runCommand
        },
        {
          identifier: id,
          content: `@run ${runCommand.raw.command || ''}`
        },
        {
          sourceType: 'directive',
          directive: 'run'
        },
        location(),
        'run'
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ addPath:AddDirectiveRef {
      return helpers.createStructuredDirective(
        'text',
        'textAssignment',
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: addPath
        },
        {
          identifier: id,
          content: `@add ${addPath.raw.path || ''}`
        },
        {
          sourceType: 'directive',
          directive: 'add'
        },
        location(),
        'add'
      );
    }