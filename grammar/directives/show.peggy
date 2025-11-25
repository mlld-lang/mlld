// SHOW DIRECTIVE
// Implementation of the /show directive for displaying content from various sources
// Replaces: /add directive - DELETED with no backward compatibility

/* 
# Show Directive

The show directive displays content from templates, variables, paths, or sections.
It can be used in these forms:
1. /show ::Template content::                 - Show template content with @var interpolation
2. /show @variable                            - Show variable content
3. /show <path/to/file.md>                    - Show content from a file
4. /show <path/to/file.md # Header Title>     - Show a specific section from a file
*/

// Core content handlers (context, tokens, whitespace, variables, template, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL SHOW DIRECTIVE
// -------------------------------------------------------------

// Primary /show directive with all variants
SlashShow
  // Command execution syntax: /show {echo "test"}
  = DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ content:UnifiedCommandBrackets tail:TailModifiers? ending:StandardDirectiveEnding {
      // Command syntax for display: /show {command}
      helpers.debug('SlashShow matched command for display', { content, tail });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      const meta = {
        ...content.meta,
        executionMode: 'display',  // Key difference from /run
        executionType: 'command',
        isExecutionContent: true,
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }

      // Apply unified pipeline processing
      helpers.processPipelineEnding(content.values, content.raw, meta, ending);

      // Add withClause from tail if present
      if (tail) {
        content.values.withClause = tail;
        content.raw.withClause = tail;
        meta.withClause = tail;
      }

      if (labelInfo) {
        content.values.securityLabels = labelInfo.labels;
        content.raw.securityLabels = labelInfo.raw;
      }

      return helpers.createStructuredDirective(
        DirectiveKind.show,
        'showCommand',
        content.values,
        content.raw,
        meta,
        location(),
        'command'
      );
    }
  // Code execution syntax: /show js {console.log("test")}
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ lang:RunCodeLanguage _ content:UnifiedCodeBrackets tail:TailModifiers? ending:StandardDirectiveEnding {
      // Code syntax for display: /show language {code}
      helpers.debug('SlashShow matched code for display', { lang, content });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: content.content, location: location() });
      
      const values = {
        lang: [langNode],
        args: [],
        code: [codeNode]
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      const raw = {
        lang: lang,
        args: [],
        code: content.content
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      const meta = {
        isMultiLine: content.isMultiLine,
        language: lang,
        hasVariables: false,
        executionMode: 'display',  // Key difference from /run
        executionType: 'code',
        isExecutionContent: true
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show,
        'showCode',
        values,
        raw,
        meta,
        location(),
        'code'
      );
    }
  // REMOVED: Foreach section expression - superseded by file reference interpolation
  // Migration: Use /show <*.md # section> as "template" instead
  // Foreach command expression: /show foreach @command(@arrays)
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ expr:ForeachCommandExpression ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched foreach expression', { expr, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Extract the inner value from the ForeachCommandExpression
      const foreachValue = expr.value;
      
      // Create values object with foreach expression
      const values = {
        foreach: foreachValue
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add with clause if present
      if (foreachValue.with) {
        values.withClause = foreachValue.with;
      }
      
      // Create raw object
      let rawString = 'foreach ';
      if (foreachValue.execInvocation.type === 'ExecInvocation') {
        rawString += `@${foreachValue.execInvocation.commandRef.name}(...)`;
      } else {
        rawString += `@${foreachValue.execInvocation.identifier || 'unknown'}(...)`;
      }
      
      const raw = {
        foreach: rawString
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      if (foreachValue.with) {
        raw.withClause = 'with { ... }';
      }
      
      // Create meta object
      const meta = {
        isForeach: true,
        hasExecInvocation: true
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show,
        'showForeach',
        values,
        raw,
        meta,
        location(),
        'foreach'
      );
    }
  // Double-bracketed path with section: [[path/to/file.md # Section]]
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ content:WrappedTemplateContent &{ return content.type === 'doubleBracketSection'; } rename:AsNewTitle? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched double-bracketed path section', { content, rename, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      const rawPath = content.raw.split(' # ')[0];
      const sectionText = content.section;
      
      // Create values object
      const values = {
        sectionTitle: content.sectionNodes || [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })],
        path: content.parts
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add new title if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw object
      const raw = {
        sectionTitle: sectionText,
        path: rawPath
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add new title to raw if present
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: helpers.createPathMetadata(rawPath, content.parts)
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showPathSection', 
        values, 
        raw, 
        meta, 
        location(),
        'section'  // Added source parameter
      );
    }
  // Load content expression: <path/to/file.md> or <path # Section>
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ content:AlligatorExpression rename:AsNewTitle? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched load content expression', { content, rename, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Handle content loading
      const values = {
        loadContent: content
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add rename if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw representation
      const raw = {
        loadContent: text()
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta
      const meta = {
        hasSection: content.options && content.options.section,
        sourceType: content.source.type
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showLoadContent', 
        values, 
        raw, 
        meta, 
        location(),
        'load-content'
      );
    }
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ template:TemplateCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched template content', { template, headerLevel, underHeader, ending });
      
      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with template content
      const values = {
        content: template.values.content
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add headerLevel and underHeader if present
      if (headerLevelValue) {
        values.headerLevel = [helpers.createNode(NodeType.Number, {
          value: headerLevelValue.value,
          raw: headerLevelValue.raw,
          location: location()
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, {
          content: underHeaderValue,
          raw: underHeaderValue,
          location: location()
        })];
      }
      
      // Create raw object with raw content string
      const raw = {
        content: template.raw.content
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object with isTemplateContent flag and security
      const meta = {
        isTemplateContent: true,
        ...template.meta
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Apply unified pipeline processing (consolidates with when.peggy)
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showTemplate', 
        values, 
        raw, 
        meta, 
        location(),
        'template'  // Added source parameter
      );
    }
  // Variable reference MUST come before exec invocation to match simple @varname first
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ "@" varRef:ShowVariableReference !("(") !TailModifiers _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched variable reference', { varRef, headerLevel, underHeader, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Extract variable reference information
      const id = varRef.identifier;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with variable node array
      const values = {
        variable: [varRef]
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add headerLevel and underHeader if present
      if (headerLevelValue) {
        values.headerLevel = [helpers.createNode(NodeType.Number, {
          value: headerLevelValue.value,
          raw: headerLevelValue.raw,
          location: location()
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, {
          content: underHeaderValue,
          raw: underHeaderValue,
          location: location()
        })];
      }
      
      // Create raw object with raw variable string
      const raw = {
        variable: `@${id}`
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object placeholder
      const meta = {};
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showVariable', 
        values, 
        raw, 
        meta, 
        location(),
        'variable'  // Added source parameter
      );
    }
  // Unified reference (exec invocation or variable) with tail modifiers - /show @obj.method() | @modifiers
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ invocation:UnifiedReferenceWithTail _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched unified reference with tail modifiers', { invocation, headerLevel, underHeader, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Handle both ExecInvocation and VariableReferenceWithTail types
      const isExecInvocation = invocation.type === 'ExecInvocation';
      const commandRef = isExecInvocation ? invocation.commandRef : null;
      const hasParentheses = isExecInvocation && commandRef.args !== null && commandRef.args !== undefined;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create a generic invocation - runtime will determine if it's template or exec
      const values = {
        invocation: invocation
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add headerLevel and underHeader if present
      if (headerLevelValue) {
        values.headerLevel = [helpers.createNode(NodeType.Number, {
          value: headerLevelValue.value,
          raw: headerLevelValue.raw,
          location: location()
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, {
          content: underHeaderValue,
          raw: underHeaderValue,
          location: location()
        })];
      }
      
      // Create raw object based on invocation type
      const raw = {};
      if (isExecInvocation) {
        raw.invocation = commandRef.name;
        raw.arguments = commandRef.args ? commandRef.args.map(arg => {
          if (arg.type === NodeType.Text) return arg.content;
          if (arg.type === NodeType.VariableReference) return `@${arg.identifier}`;
          return arg;
        }).join(', ') : '';
      } else {
        // VariableReferenceWithTail
        const variable = invocation.variable || invocation;
        raw.variable = `@${variable.identifier}${variable.fields ? variable.fields.map(f => `.${f.value || f.name || f.index}`).join('') : ''}`;
      }
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object based on invocation type
      const meta = {
        hasParentheses: hasParentheses,
        argumentCount: isExecInvocation && commandRef.args ? commandRef.args.length : 0
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      // Apply unified pipeline processing for ending tail (adds values.pipeline/meta.withClause)
      helpers.processPipelineEnding(values, raw, meta, ending);

      // Determine subtype based on invocation type
      const subtype = isExecInvocation ? 'showInvocation' : 'showVariable';
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        subtype, 
        values, 
        raw, 
        meta, 
        location(),
        'invocation'
      );
    }
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ "\"" content:$([^"]*) "\"" _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched quoted string', { content, headerLevel, underHeader, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Create path structure
      const path = {
        type: 'path',
        subtype: 'filePath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content, location: location() })]
        },
        raw: { 
          path: content
        },
        meta: helpers.createPathMetadata(content, [helpers.createNode(NodeType.Text, { content, location: location() })])
      };
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with path parts
      const values = {
        path: path.values.path
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add headerLevel and underHeader if present
      if (headerLevelValue) {
        values.headerLevel = [helpers.createNode(NodeType.Number, {
          value: headerLevelValue.value,
          raw: headerLevelValue.raw,
          location: location()
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, {
          content: underHeaderValue,
          raw: underHeaderValue,
          location: location()
        })];
      }
      
      // Create raw object with raw path string
      const raw = {
        path: content
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object with path metadata and security
      const meta = {
        path: path.meta
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showPath', 
        values, 
        raw, 
        meta, 
        location(),
        'path'
      );
    }
  / DirectiveContext "/show" labelsSegment:(_ DataLabelList)? _ path:PathExpression _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched path', { path, headerLevel, underHeader, ending });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with path parts
      const values = {
        path: path.values.path || path.values.url
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }
      
      // Add headerLevel and underHeader if present
      if (headerLevelValue) {
        values.headerLevel = [helpers.createNode(NodeType.Number, {
          value: headerLevelValue.value,
          raw: headerLevelValue.raw,
          location: location()
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, {
          content: underHeaderValue,
          raw: underHeaderValue,
          location: location()
        })];
      }
      
      // Create raw object with raw path string
      const raw = {
        path: path.raw.path || path.raw.url
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: {
          ...path.meta,
          pathSubtype: path.subtype // Preserve the specific path type
        }
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showPath', 
        values, 
        raw, 
        meta, 
        location(),
        'path'  // Added source parameter
      );
    }
    
  // Error Recovery Rules for /show directive
  // -----------------------------------------
  
  // Error: Unclosed double brackets [[ (for path section expressions)
  / DirectiveContext "/show" (_ DataLabelList)? _ "[[" &{
      // Check if we have unclosed double brackets
      let i = peg$currPos;
      let depth = 1;
      while (i < input.length - 1 && depth > 0) {
        if (input[i] === '[' && input[i+1] === '[') {
          depth++;
          i += 2;
        } else if (input[i] === ']' && input[i+1] === ']') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      return depth > 0;
    } {
      helpers.mlldError("Unclosed double brackets in /show directive. Expected closing ']]' for path section expression.", "]]", location());
    }
    
  // Error: Unclosed alligator bracket <
  / DirectiveContext "/show" (_ DataLabelList)? _ "<" &{
      // Check if we have an unclosed alligator bracket
      let i = peg$currPos;
      while (i < input.length) {
        if (input[i] === '>') return false;
        if (input[i] === '\n') return true;
        i++;
      }
      return true;
    } {
      helpers.mlldError("Unclosed alligator bracket in /show directive. Expected closing '>' for content loading.", ">", location());
    }
    
    
  // Error: Invalid @ usage (not followed by valid identifier)
  / DirectiveContext "/show" (_ DataLabelList)? _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid variable reference in /show directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Unclosed backtick template
  / DirectiveContext "/show" (_ DataLabelList)? _ "`" &{
      let i = peg$currPos;
      while (i < input.length) {
        if (input[i] === '`' && input[i-1] !== '\\') return false;
        if (input[i] === '\n') return true; // Unclosed on newline
        i++;
      }
      return true; // Unclosed at end of input
    } {
      helpers.mlldError("Unclosed backtick template in /show directive. Expected closing backtick (`).", "`", location());
    }
    
  // Error: Unclosed double-colon template
  / DirectiveContext "/show" (_ DataLabelList)? _ "::" &{
      return helpers.isUnclosedTemplate(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed double-colon template in /show directive. Expected closing '::' delimiter.", "::", location());
    }
    
  // Error: Missing content after /show
  / DirectiveContext "/show" (_ DataLabelList)? _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /show directive. Expected template, variable, or path to show.", "@", location());
    }
    
  // Error: Invalid foreach syntax
  / DirectiveContext "/show" (_ DataLabelList)? _ "foreach" _ &{
      // Check if we have incomplete foreach syntax
      const rest = input.substring(peg$currPos).trim();
      return !rest.startsWith('@') && !rest.startsWith('<');
    } {
      helpers.mlldError("Invalid foreach syntax in /show directive. Expected '@command(@arrays)' or '<@array.field # section>' after 'foreach'.", "foreach", location());
    }
    
  // Error: Generic /show syntax error (catch-all)
  / DirectiveContext "/show" {
      helpers.mlldError("Invalid /show syntax. Expected: /show `template`, /show @variable, /show <path>, or /show <path # section>", "`", location());
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Reference for other directives to use
AddDirectiveRef
  = RHSContext _ content:AlligatorExpression {
      // Handle alligator syntax for showing file content
      return {
        subtype: 'showLoadContent',
        values: { loadContent: content },
        raw: { loadContent: content.source.raw },
        meta: { 
          sourceType: content.source.type
        }
      };
    }
  / RHSContext _ quote:UnifiedDoubleQuote {
      // Handle quoted paths - extract content from unified quote
      return {
        subtype: 'showPath',
        values: { path: quote.content },
        raw: { path: helpers.reconstructRawString(quote.content) },
        meta: { 
          path: helpers.createPathMetadata(helpers.reconstructRawString(quote.content), quote.content)
        }
      };
    }
  / RHSContext _ path:$([^\r\n]*) {
      // Fallback for simple path text
      return {
        subtype: 'showPath',
        values: { path: [helpers.createNode(NodeType.Text, { content: path, location: location() })] },
        raw: { path },
        meta: {}
      };
    }

// Variable references in show directive now use unified core directly
ShowVariableReference = UnifiedAtVar

// Helper rule for quoted content
QuotedContent
    = '"' content:$(!'"' .)* '"' {
        return [helpers.createNode(NodeType.Text, { content, location: location() })];
      }
  / "'" content:$(!"'" .)* "'" {
        return [helpers.createNode(NodeType.Text, { content, location: location() })];
      }

// Helper rule for header level specification
HeaderLevel
  = _ "as" _ level:("#"+) {
    const value = level.length;
    const raw = level.join('');
    return { 
      value: value,
      raw: raw
    };
  }

// Helper rule for under header specification
UnderHeader
  = _ "under" _ header:TextUntilNewline {
    return header.trim();
  }

// Helper rule for the "as newTitle" part of the Section add directive
AsNewTitle
  = _ "as" _ title:LiteralContent {
      return title;
    }

// BracketWithSection helper removed - using BracketedPathSection from patterns/path-section.peggy

// Helper rule for template invocation arguments
// Using standard list pattern from patterns/lists.peggy
// Compatibility wrappers - still used in some patterns
TemplateArgumentList = UnifiedArgumentListItems
TemplateArgument = UnifiedArgument

// Helper for quoted strings in template arguments
QuotedStringContent
  = '"' content:$(!'"' .)* '"' { return content; }
  / "'" content:$(!"'" .)* "'" { return content; }

// Removed SemanticAddSectionContent - now using shared SemanticSectionContent from patterns/content.peggy
