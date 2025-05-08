// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      return helpers.createStructuredDirective(
        'text',
        'textAssignment',
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: template.values.content
        },
        {
          identifier: id,
          content: template.raw.content
        },
        { 
          sourceType: 'literal'
        },
        location(),
        'literal'
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