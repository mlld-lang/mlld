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
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ command:CommandCore {
      helpers.debug('AtText matched @run with CommandCore abstraction', { id, command });
      
      // Use the proper subtype and sourceType
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with run information
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: command.meta.hasVariables || false,
        run: {
          isCommand: true
        }
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: command.values.command // Use the command array from CommandCore
        },
        {
          identifier: id,
          content: `@run ${command.raw.command}`
        },
        meta,
        location(),
        'run'
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ runCode:RunLanguageCodeCore {
      helpers.debug('AtText matched @run using RunLanguageCodeCore abstraction', { id, runCode });
      
      // Use the proper subtype and sourceType
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with run information
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: false,
        run: {
          language: runCode.meta.language,
          isMultiLine: runCode.meta.isMultiLine
        }
      };
      
      // Create raw content string
      const rawContent = `@run ${runCode.meta.language}${
        runCode.raw.args && runCode.raw.args.length > 0 ? 
        `(${runCode.raw.args.join(', ')})` : ''
      } [${runCode.raw.code}]`;
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: runCode.values.code // Use the code array from RunLanguageCodeCore
        },
        {
          identifier: id,
          content: rawContent
        },
        meta,
        location(),
        'run'
      );
    }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ "@" commandRef:CommandReference {
      helpers.debug('AtText matched @run with command reference', { id, commandRef });
      
      // Use the proper subtype and sourceType
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with run information
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: false,
        run: {
          isCommandRef: true,
          commandName: commandRef.name
        }
      };
      
      // Create command reference syntax
      const rawContent = `@run @${commandRef.name}${
        commandRef.args && commandRef.args.length > 0 ? 
        `(${commandRef.args.map(arg => arg.value || '').join(', ')})` : ''
      }`;
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [helpers.createNode(NodeType.Text, { content: rawContent })]
        },
        {
          identifier: id,
          content: rawContent
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