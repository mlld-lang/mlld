// ADD DIRECTIVE
// Implementation of the @add directive for adding content from various sources

/* 
# Add Directive

The add directive includes content from templates, variables, paths, or sections.
It can be used in these forms:
1. @add [[Template content]]                 - Add template content
2. @add @variable                            - Add variable content
3. @add [path/to/file.md]                    - Add content from a file
4. @add "# Header" from [path.md] as "# New" - Add a specific section from a file
*/

// Core content handlers (context, tokens, whitespace, variables, template, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL ADD DIRECTIVE
// -------------------------------------------------------------

// Primary @add directive with all variants
AtAdd
  // Bracketed path with section: [path/to/file.md # Section] - must come first for precedence  
  = DirectiveContext "@add" _ !'[[' section:BracketedPathSection rename:AsNewTitle? {
      helpers.debug('AtAdd matched bracketed path section', { section, rename });
      
      const rawPath = section.path;
      const sectionText = section.section;
      
      // Parse the path text into parts (this is simplified - in real implementation you'd want proper parsing)
      const pathParts = [helpers.createNode(NodeType.Text, { content: rawPath, location: location() })];
      
      // Create values object
      const values = {
        sectionTitle: [helpers.createNode(NodeType.Text, { content: sectionText, location: location() })],
        path: pathParts
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
        path: helpers.createPathMetadata(rawPath, pathParts)
      };
      
      return helpers.createStructuredDirective(
        'add', 
        'addPathSection', 
        values, 
        raw, 
        meta, 
        location(),
        'section'  // Added source parameter
      );
    }
  / DirectiveContext "@add" _ sectionTitle:QuotedContent _ "from" _ path:PathExpression security:(_ s:SecurityOptions { return s; })? _ asTitle:AsNewTitle? {
      // This rule should match section syntax FIRST before the template rule below
      helpers.debug('AtAdd matched section', { sectionTitle, path, asTitle, security });
      
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
        'add', 
        'addPathSection', 
        values, 
        raw, 
        meta, 
        location(),
        'section'  // Added source parameter
      );
    }
  / DirectiveContext "@add" _ security:(SecurityOptions _)? template:TemplateCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtAdd matched template content', { template, headerLevel, underHeader });
      
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
        'add', 
        'addTemplate', 
        values, 
        raw, 
        meta, 
        location(),
        'template'  // Added source parameter
      );
    }
  // Template invocation - @add @templateName(args)
  / DirectiveContext "@add" _ "@" id:BaseIdentifier _ "(" _ args:TemplateArgumentList? _ ")" _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      helpers.debug('AtAdd matched template invocation', { id, args, headerLevel, underHeader });
      
      // Process arguments
      const processedArgs = args || [];
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with template name and arguments
      const values = {
        templateName: [helpers.createNode(NodeType.Text, { content: id, location: location() })],
        arguments: processedArgs
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
      
      // Create raw object with template invocation syntax
      const raw = {
        templateName: id,
        arguments: processedArgs.map(arg => {
          if (arg.type === 'string') return `"${arg.value}"`;
          if (arg.type === 'variable') return `@${arg.value.identifier}`;
          return arg.value || '';
        })
      };
      
      // Add headerLevel and underHeader to raw if present
      if (headerLevelValue) {
        raw.headerLevel = headerLevelValue.raw;
      }
      
      if (underHeaderValue) {
        raw.underHeader = underHeaderValue;
      }
      
      // Create meta object for template invocation
      const meta = {
        isTemplateInvocation: true,
        argumentCount: processedArgs.length
      };
      
      return helpers.createStructuredDirective(
        'add', 
        'addTemplateInvocation', 
        values, 
        raw, 
        meta, 
        location(),
        'templateInvocation'
      );
    }
  / DirectiveContext "@add" _ security:(SecurityOptions _)? "@" varRef:VariableReference _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtAdd matched variable reference', { varRef, headerLevel, underHeader });
      
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
        'add', 
        'addVariable', 
        values, 
        raw, 
        meta, 
        location(),
        'variable'  // Added source parameter
      );
    }
  / DirectiveContext "@add" _ security:(SecurityOptions _)? "\"" content:$([^"]*) "\"" _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtAdd matched quoted string', { content, headerLevel, underHeader, securityOptions });
      
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
        'add', 
        'addPath', 
        values, 
        raw, 
        meta, 
        location(),
        'path'
      );
    }
  / DirectiveContext "@add" _ !("[[") !('[' [^#\]]* '#') path:PathExpression security:(_ s:SecurityOptions { return s; })? _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      helpers.debug('AtAdd matched path', { path, headerLevel, underHeader, security });
      
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
        'add', 
        'addPath', 
        values, 
        raw, 
        meta, 
        location(),
        'path'  // Added source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Reference for other directives to use
AddDirectiveRef
  = RHSContext _ path:WrappedPathContent {
      return {
        subtype: 'addPath',
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
        subtype: 'addPath',
        values: { path: [helpers.createNode(NodeType.Text, { content: path, location: location() })] },
        raw: { path },
        meta: {}
      };
    }

// Helper rule for variable references in add directive
VariableReference
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
  / "@" varRef:VariableReference {
      return { type: 'variable', value: varRef };
    }

// Helper for quoted strings in template arguments
QuotedStringContent
  = '"' content:$(!'"' .)* '"' { return content; }
  / "'" content:$(!"'" .)* "'" { return content; }
