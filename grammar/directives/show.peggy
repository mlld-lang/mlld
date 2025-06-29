// SHOW DIRECTIVE
// Implementation of the /show directive for displaying content from various sources
// Replaces: /add directive - DELETED with no backward compatibility

/* 
# Show Directive

The show directive displays content from templates, variables, paths, or sections.
It can be used in these forms:
1. /show [[Template content]]                 - Show template content
2. /show @variable                            - Show variable content
3. /show [path/to/file.md]                    - Show content from a file
4. /show "# Header" from [path.md] as "# New" - Show a specific section from a file
*/

// Core content handlers (context, tokens, whitespace, variables, template, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL SHOW DIRECTIVE
// -------------------------------------------------------------

// Primary /show directive with all variants
SlashShow
  // Foreach section expression: /show foreach [@array.field # section] as [[template]]
  = DirectiveContext "/show" _ expr:ForeachSectionExpression {
      helpers.debug('SlashShow matched foreach section expression', { expr });
      
      // Extract the inner value from the ForeachSectionExpression
      const foreachValue = expr.value;
      
      // Create values object with foreach section expression
      const values = {
        foreach: foreachValue
      };
      
      // Create raw object
      const raw = {
        foreach: `foreach [@${foreachValue.arrayVariable}.${foreachValue.pathField} # ${foreachValue.sectionRaw}] as [[${foreachValue.template.raw.content}]]`
      };
      
      // Create meta object
      const meta = {
        isForeachSection: true,
        arrayVariable: foreachValue.arrayVariable,
        pathField: foreachValue.pathField
      };
      
      return helpers.createStructuredDirective(
        DirectiveKind.show,
        'showForeachSection',
        values,
        raw,
        meta,
        location(),
        'foreach-section'
      );
    }
  // Foreach command expression: /show foreach @command(@arrays)
  / DirectiveContext "/show" _ expr:ForeachCommandExpression {
      helpers.debug('SlashShow matched foreach expression', { expr });
      
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
      const raw = {
        foreach: `foreach @${foreachValue.command.identifier}(${foreachValue.arrays.map(a => `@${a.identifier}`).join(', ')})`
      };
      
      if (foreachValue.with) {
        raw.withClause = 'with { ... }';
      }
      
      // Create meta object
      const meta = {
        isForeach: true,
        arrayCount: foreachValue.arrays.length
      };
      
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
  / DirectiveContext "/show" _ content:WrappedTemplateContent &{ return content.type === 'doubleBracketSection'; } rename:AsNewTitle? {
      helpers.debug('SlashShow matched double-bracketed path section', { content, rename });
      
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
  // Single-bracketed path with section: [path/to/file.md # Section]  
  / DirectiveContext "/show" _ content:SemanticSectionContent rename:AsNewTitle? {
      helpers.debug('SlashShow matched bracketed path section', { content, rename });
      
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
  / DirectiveContext "/show" _ sectionTitle:QuotedContent _ "from" _ path:PathExpression security:(_ s:SecurityOptions { return s; })? _ asTitle:AsNewTitle? {
      // This rule should match section syntax FIRST before the template rule below
      helpers.debug('SlashShow matched section', { sectionTitle, path, asTitle, security });
      
      // Process the section title and path
      const sectionTitleNode = sectionTitle[0]; // Get the first node from the array
      
      // Create values object
      const values = {
        sectionTitle: sectionTitle,
        path: path.values.path || path.values.url
      };
      
      // Add new title if provided
      if (asTitle) {
        values.newTitle = asTitle;
      }
      
      // Create raw object
      const raw = {
        sectionTitle: sectionTitleNode.content,
        path: path.raw.path || path.raw.url
      };
      
      // Add new title to raw if present
      if (asTitle) {
        raw.newTitle = asTitle[0].content;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: {
          ...path.meta,
          pathSubtype: path.subtype // Preserve the specific path type
        },
        ...helpers.createSecurityMeta(security)
      };
      
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
  / DirectiveContext "/show" _ security:(SecurityOptions _)? template:TemplateCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched template content', { template, headerLevel, underHeader });
      
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
  / DirectiveContext "/show" _ security:(SecurityOptions _)? "@" varRef:ShowVariableReference !("(") !TailModifiers _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched variable reference', { varRef, headerLevel, underHeader });
      
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
  // Exec invocation with tail modifiers - /show @command() | @modifiers
  / DirectiveContext "/show" _ "@" invocation:ExecInvocationWithTail _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      helpers.debug('SlashShow matched exec invocation with tail modifiers', { invocation, headerLevel, underHeader });
      
      // Extract command reference info
      const commandRef = invocation.commandRef;
      const hasParentheses = commandRef.args !== null && commandRef.args !== undefined;
      
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
      
      // Create raw object
      const raw = {
        invocation: commandRef.name,
        arguments: commandRef.args ? commandRef.args.map(arg => {
          if (arg.type === NodeType.Text) return arg.content;
          if (arg.type === NodeType.VariableReference) return `@${arg.identifier}`;
          return arg;
        }).join(', ') : ''
      };
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object
      const meta = {
        hasParentheses: hasParentheses,
        argumentCount: commandRef.args ? commandRef.args.length : 0
      };
      
      return helpers.createStructuredDirective(
        DirectiveKind.show, 
        'showInvocation', 
        values, 
        raw, 
        meta, 
        location(),
        'invocation'
      );
    }
  / DirectiveContext "/show" _ security:(SecurityOptions _)? "\"" content:$([^"]*) "\"" _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashShow matched quoted string', { content, headerLevel, underHeader, securityOptions });
      
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
  / DirectiveContext "/show" _ !("[[") !('[' [^#\]]* '#') path:PathExpression security:(_ s:SecurityOptions { return s; })? _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      helpers.debug('SlashShow matched path', { path, headerLevel, underHeader, security });
      
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
    
  // Error: Unclosed single bracket [
  / DirectiveContext "/show" _ "[" &{
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed path bracket in /show directive. Expected closing ']' for path specification.", "]", location());
    }
    
  // Error: Missing 'from' keyword in section syntax
  / DirectiveContext "/show" _ QuotedContent _ &{
      // Look ahead to see if next non-whitespace is [ or path-like
      let i = peg$currPos;
      while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
        i++;
      }
      // If we see [ or a path-like character, but didn't match section syntax, must be missing 'from'
      if (i < input.length && (input[i] === '[' || input[i] === '/' || /[a-zA-Z0-9.]/.test(input[i]))) {
        return true;
      }
      return false;
    } {
      helpers.mlldError("Invalid section syntax in /show directive. Expected 'from' keyword after section title. Use: /show \"Section Title\" from [path]", "from", location());
    }
    
  // Error: Missing path after 'from' in section syntax
  / DirectiveContext "/show" _ QuotedContent _ "from" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing path in /show section syntax. Expected a path after 'from' keyword.", "path", location());
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
      return !rest.startsWith('@') && !rest.startsWith('[');
    } {
      helpers.mlldError("Invalid foreach syntax in /show directive. Expected '@command(@arrays)' or '[@array.field # section]' after 'foreach'.", "foreach", location());
    }
    
  // Error: Generic /show syntax error (catch-all)
  / DirectiveContext "/show" {
      helpers.mlldError("Invalid /show syntax. Expected: /show `template`, /show @variable, /show [path], or /show \"section\" from [path]", "`", location());
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Reference for other directives to use
AddDirectiveRef
  = RHSContext _ path:WrappedPathContent {
      return {
        subtype: 'showPath',
        values: { path: path.parts },
        raw: { path: path.raw },
        meta: { 
          path: helpers.createPathMetadata(path.raw, path.parts)
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
TemplateArgumentList
  = first:TemplateArgument rest:(CommaSpace arg:TemplateArgument { return arg; })* {
      return [first, ...rest];
    }

TemplateArgument
  = str:QuotedStringContent {
      return { type: 'string', value: str };
    }
  / "@" varRef:ShowVariableReference {
      return { type: 'variable', value: varRef };
    }

// Helper for quoted strings in template arguments
QuotedStringContent
  = '"' content:$(!'"' .)* '"' { return content; }
  / "'" content:$(!"'" .)* "'" { return content; }

// Removed SemanticAddSectionContent - now using shared SemanticSectionContent from patterns/content.peggy
