// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

/* 
# Text Directive

The text directive defines text variables that can include interpolated variables.
It can be used in these forms:
1. @text varName = "string literal"     - Basic string assignment
2. @text varName = template with {{var}} - Template with variable interpolation
3. @text varName = @run command          - Output from command execution
*/

// Core content handlers (context, tokens, whitespace, variables, template)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL TEXT DIRECTIVE
// -------------------------------------------------------------

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      helpers.debug('AtText matched template', { id, template });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Determine if this is a literal string (textAssignment) or a template (textTemplate)
      const isTemplateLiteral = template.raw.content.includes('{{') || template.raw.content.includes('[[');
      const subtype = isTemplateLiteral ? 'textTemplate' : 'textAssignment';
      const source = isTemplateLiteral ? 'template' : 'literal';
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [idNode],
          content: template.values.content
        },
        {
          identifier: id,
          content: template.raw.content
        },
        {
          ...template.meta,
          sourceType: isTemplateLiteral ? 'template' : 'literal'
        },
        location(),
        source  // Source parameter
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ runCommand:RunDirectiveRef {
      helpers.debug('AtText matched @run command', { id, runCommand });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      return helpers.createStructuredDirective(
        'text',
        'textAssignment',
        {
          identifier: [idNode],
          content: runCommand  // Store the complete run directive node
        },
        {
          identifier: id,
          content: `@run ${runCommand.raw.command || ''}`
        },
        {
          sourceType: 'directive',
          directive: 'run',
          run: { type: runCommand.subtype }
        },
        location(),
        'run'  // Source parameter
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ RHSContext "@add" _ addPath:AddDirectiveRef {
      helpers.debug('AtText matched @add path', { id, addPath });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      return helpers.createStructuredDirective(
        'text',
        'textAssignment',
        {
          identifier: [idNode],
          content: addPath  // Store the complete add directive node
        },
        {
          identifier: id,
          content: `@add ${addPath.raw.path || ''}`
        },
        {
          sourceType: 'directive',
          directive: 'add',
          add: { type: addPath.subtype }
        },
        location(),
        'add'  // Source parameter
      );
    }

// -------------------------------------------------------------
// DIRECTIVE REFERENCES FOR RHS CONTEXTS
// -------------------------------------------------------------