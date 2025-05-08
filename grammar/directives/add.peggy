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
  = DirectiveContext "@add" _ template:TemplateCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
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
          raw: headerLevelValue.raw
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, { 
          content: underHeaderValue, 
          raw: underHeaderValue 
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
      
      // Create meta object with isTemplateContent flag
      const meta = {
        isTemplateContent: true,
        ...template.meta
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
  / DirectiveContext "@add" _ "@" varRef:VariableReference _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
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
          raw: headerLevelValue.raw
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, { 
          content: underHeaderValue, 
          raw: underHeaderValue 
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
      
      // Create empty meta object for variable embedding
      const meta = {};
      
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
  / DirectiveContext "@add" _ path:PathCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
      helpers.debug('AtAdd matched path', { path, headerLevel, underHeader });
      
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
          raw: headerLevelValue.raw
        })];
      }
      
      if (underHeaderValue) {
        values.underHeader = [helpers.createNode(NodeType.Text, { 
          content: underHeaderValue, 
          raw: underHeaderValue 
        })];
      }
      
      // Create raw object with raw path string
      const raw = {
        path: path.raw.path
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
          hasVariables: path.meta.hasVariables,
          isAbsolute: path.meta.isAbsolute,
          hasExtension: path.meta.hasExtension,
          extension: path.meta.extension
        }
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
  / DirectiveContext "@add" _ sectionTitle:QuotedContent _ "from" _ path:PathCore _ asTitle:AsNewTitle? {
      helpers.debug('AtAdd matched section', { sectionTitle, path, asTitle });
      
      // Process the section title and path
      const sectionTitleNode = sectionTitle[0]; // Get the first node from the array
      
      // Create values object
      const values = {
        sectionTitle: sectionTitle,
        path: path.values.path
      };
      
      // Add new title if provided
      if (asTitle) {
        values.newTitle = asTitle;
      }
      
      // Create raw object
      const raw = {
        sectionTitle: sectionTitleNode.content,
        path: path.raw.path
      };
      
      // Add new title to raw if present
      if (asTitle) {
        raw.newTitle = asTitle[0].content;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: {
          hasVariables: path.meta.hasVariables,
          isAbsolute: path.meta.isAbsolute,
          hasExtension: path.meta.hasExtension,
          extension: path.meta.extension
        }
      };
      
      return helpers.createStructuredDirective(
        'add', 
        'addSection', 
        values, 
        raw, 
        meta, 
        location(),
        'section'  // Added source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Reference for other directives to use
AddDirectiveRef
  = RHSContext _ path:$([^\r\n]*) {
      return {
        subtype: 'addPath',
        values: { path: [helpers.createNode(NodeType.Text, { content: path }, location())] },
        raw: { path },
        meta: {}
      };
    }

// Helper rule for variable references in add directive
VariableReference
  = id:BaseIdentifier {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id
      }, location());
    }

// Helper rule for quoted content
QuotedContent
  = '"' content:$(!'"' .)* '"' { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / "'" content:$(!"'" .)* "'" { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
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
  = _ "as" _ title:QuotedContent {
      return title;
    }

