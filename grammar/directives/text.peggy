// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  // Bracketed path with section: [path/to/file.md # Section] - must come first for precedence
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ section:BracketedPathSection rename:AsNewTitle? {
      helpers.debug('AtText matched bracketed path section', { id, section, rename });
      
      const subtype = 'textPathSection';
      const sourceType = 'section';
      
      const rawPath = section.path;
      const sectionText = section.section;
      
      // Parse the path text into parts (simplified)
      const pathParts = [helpers.createNode(NodeType.Text, { content: rawPath, location: location() })];
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        section: [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })],
        path: pathParts
      };
      
      // Add rename if present
      if (rename) {
        values.rename = rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        section: sectionText,
        path: rawPath
      };
      
      if (rename) {
        raw.rename = helpers.reconstructRawString(rename);
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        hasRename: !!rename,
        hasVariables: false // Simplified for now
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
        raw,
        meta,
        location(),
        sourceType
      );
    }
  // Section extraction - must come first to avoid quoted string being matched as template
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ section:SectionExtractionCore {
      helpers.debug('AtText matched section extraction', { id, section });
      
      const subtype = section.rename ? 'textPathSection' : 'textPathSection';
      const sourceType = 'section';
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        section: section.section,
        path: section.path
      };
      
      // Add rename if present
      if (section.rename) {
        values.rename = section.rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        section: helpers.reconstructRawString(section.section),
        path: helpers.reconstructRawString(section.path)
      };
      
      if (section.rename) {
        raw.rename = helpers.reconstructRawString(section.rename);
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        hasRename: !!section.rename,
        hasVariables: section.path.some(part => 
          part && part.type === NodeType.VariableReference
        )
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
        raw,
        meta,
        location(),
        sourceType
      );
    }
  // Parameterized template definition - must come before regular template to match params
  / DirectiveContext "@text" _ id:BaseIdentifier _ "(" _ params:TextParamsList? _ ")" _ "=" _ "@add" _ template:TemplateCore {
      helpers.debug('AtText matched parameterized template definition', { id, params, template });
      
      // Process parameters
      const processedParams = params || [];
      
      // Create meta object with parameter info
      const meta = { 
        sourceType: 'template',
        hasVariables: template.meta.hasVariables,
        isTemplateContent: true,
        isParameterized: true,
        parameterCount: processedParams.length
      };
      
      return helpers.createStructuredDirective(
        'text',
        'textTemplateDefinition',
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          params: processedParams,
          content: template.values.content
        },
        {
          identifier: id,
          params: processedParams,
          content: template.raw.content
        },
        meta,
        location(),
        'template'
      );
    }
  // Template content (including [[...]]) - must come before other patterns to avoid misparsing
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
  // @add directive with bracketed path section: @text var = @add [path/to/file.md # Section]
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ section:BracketedPathSection rename:AsNewTitle? {
      helpers.debug('AtText matched @add with bracketed path section', { id, section, rename });
      
      const subtype = 'textPathSection';
      const sourceType = 'directive';
      
      const rawPath = section.path;
      const sectionText = section.section;
      
      // Parse the path text into parts (simplified)
      const pathParts = [helpers.createNode(NodeType.Text, { content: rawPath, location: location() })];
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        section: [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })],
        path: pathParts
      };
      
      // Add rename if present
      if (rename) {
        values.rename = rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        section: sectionText,
        path: rawPath
      };
      
      if (rename) {
        raw.rename = helpers.reconstructRawString(rename);
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasRename: !!rename,
        hasVariables: false // Simplified for now
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
        raw,
        meta,
        location(),
        sourceType
      );
    }
  // @add directive with section extraction - must come before path to avoid quoted strings being matched as paths
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ section:SectionExtractionCore {
      helpers.debug('AtText matched @add with section extraction', { id, section });
      
      const subtype = 'textPathSection';
      const sourceType = 'directive';
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        section: section.section,
        path: section.path
      };
      
      // Add rename if present
      if (section.rename) {
        values.rename = section.rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        section: helpers.reconstructRawString(section.section),
        path: helpers.reconstructRawString(section.path)
      };
      
      if (section.rename) {
        raw.rename = helpers.reconstructRawString(section.rename);
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasRename: !!section.rename,
        hasVariables: section.path.some(part => 
          part && part.type === NodeType.VariableReference
        )
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
        raw,
        meta,
        location(),
        sourceType
      );
    }
  // @add directive reference - for backward compatibility
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ path:PathExpression {
      helpers.debug('AtText matched @add with path', { id, path });
      
      const subtype = 'textPath';
      const sourceType = 'directive';
      
      // Check if the path contains variables
      const hasVariables = path.meta.hasVariables;
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasVariables: hasVariables,
        pathSubtype: path.subtype // Preserve the specific path type
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          path: path.values.path || path.values.url
        },
        {
          identifier: id,
          path: path.raw.path || path.raw.url
        },
        meta,
        location(),
        sourceType
      );
    }
  // Path starting with @variable - must come before command reference
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ PathStartingWithVariableContext path:PathExpression {
      helpers.debug('AtText matched path starting with @variable', { id, path });
      
      const subtype = 'textPath';
      const sourceType = 'path';
      
      // Check if the path contains variables
      const hasVariables = path.values.path.some(part => 
        part && part.type === NodeType.VariableReference
      );
      
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
          path: path.values.path
        },
        {
          identifier: id,
          path: path.raw.path || path.raw.url
        },
        meta,
        location(),
        sourceType
      );
    }
  // Command reference - @text id = @cmdRef(args) - but not @run or @add
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@" !("run" _ / "add" _) commandRef:CommandReference {
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
  // Direct path content - @text content = [file.md]
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ path:PathExpression {
      helpers.debug('AtText matched direct path content', { id, path });
      
      const subtype = 'textPath';
      const sourceType = 'path';
      
      // Check if the path contains variables
      const hasVariables = path.values.path.some(part => 
        part && part.type === NodeType.VariableReference
      );
      
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
          path: path.values.path
        },
        {
          identifier: id,
          path: path.raw.path || path.raw.url
        },
        meta,
        location(),
        sourceType
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

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Helper rules for text template parameters
// Using standard list pattern from patterns/lists.peggy
TextParamsList
  = first:TextParam rest:(CommaSpace param:TextParam { return param; })* {
      return [first, ...rest];
    }

TextParam
  = paramName:BaseIdentifier {
      return paramName; // Just return the parameter name as a string
    }

// AsNewTitle is imported from add.peggy
