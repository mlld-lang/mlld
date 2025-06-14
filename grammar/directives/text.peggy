// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  // Foreach section expression assignment - NEW pattern for section extraction
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ foreach:ForeachSectionExpression {
      helpers.debug('AtText matched foreach section expression', { id, foreach });
      
      const subtype = 'textAssignment';
      const sourceType = 'foreach-section';
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          foreach: foreach
        },
        {
          identifier: id,
          foreach: helpers.reconstructRawString([foreach])
        },
        {
          sourceType,
          hasVariables: true,
          isTemplateContent: false
        },
        location(),
        sourceType
      );
    }
  // Foreach command expression assignment - existing pattern
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ foreach:ForeachCommandExpression {
      helpers.debug('AtText matched foreach expression', { id, foreach });
      
      const subtype = 'textAssignment';
      const sourceType = 'foreach';
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          foreach: foreach
        },
        {
          identifier: id,
          foreach: helpers.reconstructRawString([foreach])
        },
        {
          sourceType,
          hasVariables: true,
          isTemplateContent: false
        },
        location(),
        sourceType
      );
    }
  // Literal string assignment with security options
  / DirectiveContext "@text" _ security:(SecurityOptions _)? id:BaseIdentifier _ "=" _ content:StringLiteral {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtText matched literal string', { id, content, securityOptions });
      
      const subtype = 'textAssignment';
      const sourceType = 'literal';
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [helpers.createNode(NodeType.Text, { content, location: location() })]
        },
        {
          identifier: id,
          content
        },
        {
          sourceType,
          hasVariables: false,
          isTemplateContent: false,
          ...helpers.createSecurityMeta(securityOptions)
        },
        location(),
        sourceType
      );
    }
  // Double-bracketed path with section: [[path/to/file.md # Section]]
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ content:WrappedTemplateContent &{ return content.type === 'doubleBracketSection'; } rename:AsNewTitle? {
      helpers.debug('AtText matched double-bracketed path section', { id, content, rename });
      
      const subtype = 'textPathSection';
      const sourceType = 'section';
      
      const rawPath = content.raw.split(' # ')[0];
      const sectionText = content.section;
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        path: content.parts,
        sectionTitle: [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })]
      };
      
      // Add new title if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        path: rawPath,
        sectionTitle: sectionText
      };
      
      // Add new title to raw if present
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      const meta = {
        sourceType,
        hasVariables: false,
        isTemplateContent: false,
        path: helpers.createPathMetadata(rawPath, content.parts)
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
  // Bracketed path (with optional section) - semantic parsing
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "[" parts:TextPathParts _ section:("#" _ s:SectionName { return s; })? "]" rename:AsNewTitle? {
      helpers.debug('AtText matched bracketed path', { id, parts, section, rename });
      
      const rawPath = helpers.reconstructRawString(parts);
      const hasSectionExtraction = !!section;
      const subtype = hasSectionExtraction ? 'textPathSection' : 'textPath';
      const sourceType = hasSectionExtraction ? 'section' : 'path';
      
      // Create values object
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        path: parts
      };
      
      if (hasSectionExtraction) {
        values.sectionTitle = [helpers.createNode(NodeType.Text, { content: section, location: location() })];
      }
      
      // Add new title if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        path: rawPath
      };
      
      if (hasSectionExtraction) {
        raw.sectionTitle = section;
      }
      
      // Add new title to raw if present
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        hasVariables: parts.some(p => p && p.type === NodeType.VariableReference),
        isTemplateContent: false,
        path: helpers.createPathMetadata(rawPath, parts)
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
  // Parameterized template definition removed - moved to @exec directive
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
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ content:WrappedPathContent &{ return content.type === 'sectionPath'; } rename:AsNewTitle? {
      helpers.debug('AtText matched @add with bracketed path section', { id, content, rename });
      
      const subtype = 'textPathSection';
      const sourceType = 'directive';
      
      const rawPath = content.raw.split(' # ')[0];
      const sectionText = content.section;
      
      // Create values object with section and path
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        path: content.parts,
        sectionTitle: [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })]
      };
      
      // Add new title if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw object
      const raw = {
        identifier: id,
        path: rawPath,
        sectionTitle: sectionText
      };
      
      // Add new title to raw if present
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasVariables: false,
        isTemplateContent: false,
        path: helpers.createPathMetadata(rawPath, content.parts)
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
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ path:PathExpression security:(_ s:SecurityOptions { return s; })? {
      helpers.debug('AtText matched @add with path', { id, path, security });
      
      const subtype = 'textPath';
      const sourceType = 'directive';
      
      // Check if the path contains variables
      const hasVariables = path.meta.hasVariables;
      
      // Create meta object
      const meta = { 
        sourceType: sourceType,
        directive: 'add',
        hasVariables: hasVariables,
        pathSubtype: path.subtype, // Preserve the specific path type
        ...helpers.createSecurityMeta(security)
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
  // Simple variable reference - @text name = @varname or @var.field.subfield
  // MUST come before exec invocation to properly match @TIME, @DEBUG, etc without parentheses
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@" !("run" _ / "add" _) varId:BaseIdentifier !"(" fields:AnyFieldAccess* {
      helpers.debug('AtText matched simple variable reference with field access', { id, varId, fields });
      
      const subtype = 'textAssignment';
      const sourceType = 'variable';
      
      // Create the variable reference node
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: varId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      const meta = { 
        sourceType: sourceType,
        hasVariables: true,
        isVariableReference: true,
        variableName: varId,
        hasFieldAccess: fields && fields.length > 0
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [varRef]
        },
        {
          identifier: id,
          content: `@${varId}${fields ? fields.map(f => f.type === 'field' || f.type === 'numericField' ? `.${f.value}` : `[${f.value}]`).join('') : ''}`
        },
        meta,
        location(),
        sourceType
      );
    }
  // Exec invocation with tail modifiers - @text name = @command() | @modifiers
  // Comes after simple variable reference so @TIME matches as variable not exec
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@" !("run" _ / "add" _) invocation:ExecInvocationWithTail {
      helpers.debug('AtText matched exec invocation with tail modifiers', { id, invocation });
      
      const subtype = 'textAssignment';
      const sourceType = 'exec';
      
      // Extract command reference info
      const commandRef = invocation.commandRef;
      
      const meta = { 
        sourceType: sourceType,
        hasVariables: false,
        isExecInvocation: true,
        commandName: commandRef.name,
        commandArgs: commandRef.args || []
      };
      
      // Create command reference syntax for content
      const rawContent = `@${commandRef.name}${
        commandRef.args && commandRef.args.length > 0 ? 
        `(${commandRef.args.map(arg => arg.value || '').join(', ')})` : ''
      }`;
      
      // Create values object
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        execInvocation: invocation
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
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
  // Check for language BEFORE bracket to avoid consuming non-language commands
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ lang:RunCodeLanguage _ "[" content:$(CodeLiteralContent) "]" {
      helpers.debug('AtText matched @run with language code', { id, lang, content });
      
      // Use the proper subtype and sourceType
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Create meta object with run information
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: false,
        run: {
          language: lang,
          isMultiLine: content.includes('\n')
        }
      };
      
      // Create raw content string
      const rawContent = `@run ${lang} [${content}]`;
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        {
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [helpers.createNode(NodeType.Text, { content, location: location() })]
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
  // Command reference with @run and tail modifiers - @text id = @run @cmdRef(args) | @transform
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ "@" invocation:ExecInvocationWithTail {
      helpers.debug('AtText matched @run with exec invocation and tail modifiers', { id, invocation });
      
      const subtype = 'textAssignment';
      const sourceType = 'directive';
      
      // Extract command reference info
      const commandRef = invocation.commandRef;
      
      // Create meta object with run information
      const meta = { 
        sourceType: sourceType,
        directive: 'run',
        hasVariables: false,
        run: {
          isExecInvocation: true,
          commandName: commandRef.name,
          commandArgs: commandRef.args || []
        }
      };
      
      // Create values object
      const values = {
        identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        runExecInvocation: invocation
      };
      
      return helpers.createStructuredDirective(
        'text',
        subtype,
        values,
        {
          identifier: id,
          content: `@run @${commandRef.name}`
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

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Text parameter rules removed - parameterized templates moved to @exec directive

// AsNewTitle is imported from add.peggy

// Path parts for text context - allows @var interpolation
TextPathParts
  = parts:(TextPathVariable / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Variable in text path context
TextPathVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable
