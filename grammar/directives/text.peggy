// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  // Template content (including [[...]]) - must come before other patterns to avoid misparsing
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
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
  // Command reference - @text id = @cmdRef(args) - but not @run
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@" !("run" _) commandRef:CommandReference {
      helpers.debug('AtText matched command reference', { id, commandRef });
      
      const subtype = 'textAssignment';
      const sourceType = 'commandRef';
      
      const meta = { 
        sourceType: sourceType,
        hasVariables: false,
        isCommandRef: true,
        commandName: commandRef.name
      };
      
      // Create command reference syntax
      const rawContent = `@${commandRef.name}${
        commandRef.args && commandRef.args.length > 0 ? 
        `(${commandRef.args.map(arg => arg.value || '').join(', ')})` : ''
      }`;
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
          {
            identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
            content: [helpers.createNode(NodeType.Text, { content: rawContent, location: location() })]
          },
        {
          identifier: id,
          content: rawContent
        },
        meta,
        location(),
        sourceType
      );
    }
  // Code execution - @text id = @run language [code]
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
  // Command execution - @text id = @run [command]
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
  // Command reference with @run - @text id = @run @cmdRef(args)
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
            content: [helpers.createNode(NodeType.Text, { content: rawContent, location: location() })]
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
  // Path content with single brackets - interpolates @var (no @add needed!)
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ pathContent:BracketContent {
      const subtype = 'textAssignment';
      const sourceType = 'path';
      
      // Check if the path contains variables
      const hasVariables = pathContent.some(part => 
        part && part.type === NodeType.VariableReference
      );
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        hasVariables: hasVariables
      };
      
      // Reconstruct raw path from parts
      const rawPath = helpers.reconstructRawString(pathContent);
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
          {
            identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
            content: pathContent
          },
        {
          identifier: id,
          content: `[${rawPath}]`
        },
        meta,
        location(),
        sourceType
      );
    }