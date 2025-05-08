// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  // Special case for @add [path] pattern which causes issues with RHS context
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ "[" path:$([^\]]*) "]" {
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with add info for test compatibility
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasVariables: false,
        add: {}
      };
      
      const pathValue = path.trim();
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [helpers.createNode(NodeType.Text, { content: pathValue })]
        },
        {
          identifier: id,
          content: `@add [${pathValue}]`
        },
        meta,
        location(),
        'add'
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      // Use both variables and template syntax for detection
      // The meta now contains both hasVariables and isTemplateContent
      
      // Determine if this is a template based on either:
      // 1. It contains variables
      // 2. It uses template syntax (e.g., [[...]])
      const isTemplate = template.meta.hasVariables || template.meta.isTemplateContent;
      
      // Set subtype and sourceType based on template detection
      const subtype = isTemplate ? 'textTemplate' : 'textAssignment';
      const sourceType = isTemplate ? 'template' : 'literal';
      
      // Create meta object with all template info
      const meta = { 
        sourceType: sourceType,
        hasVariables: template.meta.hasVariables,
        isTemplateContent: template.meta.isTemplateContent,
        // Don't include wrapperType in metadata for now
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
        hasVariables: false,
        run: {} // Add run object for test compatibility
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
        hasVariables: false,
        add: {}, // Add empty add object for test compatibility
        path: addPath.meta.path // Include path metadata
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