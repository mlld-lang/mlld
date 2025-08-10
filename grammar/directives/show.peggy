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
  // REMOVED: Foreach section expression - superseded by file reference interpolation
  // Migration: Use /show <*.md # section> as "template" instead
  // Foreach command expression: /show foreach @command(@arrays)
  = DirectiveContext "/show" _ expr:ForeachCommandExpression ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched foreach expression', { expr, ending });
      
      // Extract the inner value from the ForeachCommandExpression
      const foreachValue = expr.value;
      
      // Create values object with foreach expression
      const values = {
        foreach: foreachValue
      };
      
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
      
      if (foreachValue.with) {
        raw.withClause = 'with { ... }';
      }
      
      // Create meta object
      const meta = {
        isForeach: true,
        hasExecInvocation: true
      };
      
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
  / DirectiveContext "/show" _ content:WrappedTemplateContent &{ return content.type === 'doubleBracketSection'; } rename:AsNewTitle? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched double-bracketed path section', { content, rename, ending });
      
      const rawPath = content.raw.split(' # ')[0];
      const sectionText = content.section;
      
      // Create values object
      const values = {
        sectionTitle: content.sectionNodes || [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })],
        path: content.parts
      };
      
      // Add new title if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw object
      const raw = {
        sectionTitle: sectionText,
        path: rawPath
      };
      
      // Add new title to raw if present
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: helpers.createPathMetadata(rawPath, content.parts)
      };
      
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
  / DirectiveContext "/show" _ content:AlligatorExpression rename:AsNewTitle? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched load content expression', { content, rename, ending });
      
      // Handle content loading
      const values = {
        loadContent: content
      };
      
      // Add rename if provided
      if (rename) {
        values.newTitle = rename;
      }
      
      // Create raw representation
      const raw = {
        loadContent: text()
      };
      
      if (rename) {
        raw.newTitle = rename[0].content;
      }
      
      // Create meta
      const meta = {
        hasSection: content.options && content.options.section,
        sourceType: content.source.type
      };
      
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
  / DirectiveContext "/show" _ security:(SecurityOptions _)? template:TemplateCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched template content', { template, headerLevel, underHeader, ending });
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with template content
      const values = {
        content: template.values.content
      };
      
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
        ...template.meta,
        ...helpers.createSecurityMeta(securityOptions)
      };
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
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
  / DirectiveContext "/show" _ security:(SecurityOptions _)? "@" varRef:ShowVariableReference !("(") !TailModifiers _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched variable reference', { varRef, headerLevel, underHeader, ending });
      
      // Extract variable reference information
      const id = varRef.identifier;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with variable node array
      const values = {
        variable: [varRef]
      };
      
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
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object with security options
      const meta = {
        ...helpers.createSecurityMeta(securityOptions)
      };
      
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
  / DirectiveContext "/show" _ invocation:UnifiedReferenceWithTail _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched unified reference with tail modifiers', { invocation, headerLevel, underHeader, ending });
      
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
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
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
  / DirectiveContext "/show" _ security:(SecurityOptions _)? "\"" content:$([^"]*) "\"" _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched quoted string', { content, headerLevel, underHeader, securityOptions, ending });
      
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
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object with path metadata and security
      const meta = {
        path: path.meta,
        ...helpers.createSecurityMeta(securityOptions)
      };
      
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
  / DirectiveContext "/show" _ path:PathExpression security:(_ s:SecurityOptions { return s; })? _ headerLevel:HeaderLevel? underHeader:UnderHeader? ending:StandardDirectiveEnding {
      helpers.debug('SlashShow matched path', { path, headerLevel, underHeader, security, ending });
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with path parts
      const values = {
        path: path.values.path || path.values.url
      };
      
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
        },
        ...helpers.createSecurityMeta(security)
      };
      
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
  / DirectiveContext "/show" _ "[[" &{
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
  / DirectiveContext "/show" _ "<" &{
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
  / DirectiveContext "/show" _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid variable reference in /show directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Unclosed backtick template
  / DirectiveContext "/show" _ "`" &{
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
  / DirectiveContext "/show" _ "::" &{
      return helpers.isUnclosedTemplate(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed double-colon template in /show directive. Expected closing '::' delimiter.", "::", location());
    }
    
  // Error: Missing content after /show
  / DirectiveContext "/show" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /show directive. Expected template, variable, or path to show.", "@", location());
    }
    
  // Error: Invalid foreach syntax
  / DirectiveContext "/show" _ "foreach" _ &{
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

// Helper rule for variable references in show directive
ShowVariableReference
  = id:BaseIdentifier accessElements:AnyFieldAccess* {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(accessElements.length > 0 ? { fields: accessElements } : {})
      }, location());
    }

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
