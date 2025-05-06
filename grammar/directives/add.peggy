AddDirective
  = TemplateAddDirective    // Try template pattern first
  / SectionAddDirective     // Then section pattern
  / VariableAddDirective    // Then variable pattern  
  / PathAddDirective        // Then path pattern
  / NamedAddDirective       // Then named pattern

// Section add directive - e.g. @add "# Header" from [path.md] as "## New Title"
SectionAddDirective
  = "add" _ sectionTitle:LiteralString _ "from" _ path:WrappedPathContent _ asTitle:AsNewTitle? HWS DirectiveEOL {
      // Process the section title and path
      const sectionTitleNode = sectionTitle[0]; // Get the first node from the array
      const validatedPath = helpers.validatePath(path.parts);
      
      // Create values object
      const values = {
        sectionTitle: sectionTitle,
        path: Array.isArray(validatedPath.values) ? validatedPath.values : [validatedPath.values]
      };
      
      // Add new title if provided
      if (asTitle) {
        values.newTitle = asTitle;
      }
      
      // Create raw object
      const raw = {
        sectionTitle: sectionTitleNode.content,
        path: helpers.reconstructRawString(validatedPath.values)
      };
      
      // Add new title to raw if present
      if (asTitle) {
        raw.newTitle = asTitle[0].content;
      }
      
      // Create meta object with path metadata
      const meta = {
        path: {
          hasVariables: validatedPath.hasVariables
        }
      };
      
      return helpers.createStructuredDirective(
        'add', 
        'addSection', 
        values, 
        raw, 
        meta, 
        location(),
        'section'  // This is a new source type
      );
    }

// Template add directive - e.g. @add [[Template content]]
TemplateAddDirective
  = "add" _ t:WrappedTemplateContent _ headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      // Use the content correctly from WrappedTemplateContent
      const content = t;
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with template content
      const values = {
        content: content.parts
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
        content: content.raw
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
        isTemplateContent: true
      };
      
      return helpers.createStructuredDirective(
        'add', 
        'addTemplate', 
        values, 
        raw, 
        meta, 
        location(),
        'template'
      );
    }

// Variable add directive - e.g. @add @variable
VariableAddDirective
  = "add" _ variableRef:VariableReference _ headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      // Extract variable reference information
      const id = variableRef.identifier;
      
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Create values object with variable node array
      const values = {
        variable: [variableRef]
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
        'variable'
      );
    }

// Path add directive - e.g. @add [path/to/file.md]
PathAddDirective
  = "add" _ path:WrappedPathContent _ headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Validate the path using path.parts directly
      const validatedPath = helpers.validatePath(path.parts, { context: 'addPath' });
      
      // Create values object with path node array
      const values = {
        path: [validatedPath]
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
        path: path.raw
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
          hasVariables: validatedPath.hasVariables
        }
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

// Named add directive with multiple imports - e.g. @add {name1, name2} from file.md
NamedAddDirective
  = "add" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? DirectiveEOL {
      // Extract path and optional section from content
      const [path, section] = content.split('#');
      const sectionTrimmed = section ? section.trim() : null;
      
      // Validate the path
      const validatedPath = helpers.validatePath(helpers.createNode(NodeType.Text, { content: path.trim(), raw: path.trim() }), { context: 'addPath' });
      
      // Create variable nodes for the names
      const nameNodes = names.map(name => 
        helpers.createVariableReferenceNode('identifier', { identifier: name })
      );
      
      // Create the values object
      const values = {
        path: [validatedPath],
        names: nameNodes,
        ...(sectionTrimmed ? { section: [helpers.createNode(NodeType.Text, { content: sectionTrimmed, raw: sectionTrimmed })] } : {}),
        ...(header ? { headerLevel: [helpers.createNode(NodeType.Number, { value: header.value, raw: header.raw })] } : {}),
        ...(under ? { underHeader: [helpers.createNode(NodeType.Text, { content: under, raw: under })] } : {})
      };
      
      // Create the raw object
      const raw = {
        path: path.trim(),
        names: names.join(', '),
        ...(sectionTrimmed ? { section: sectionTrimmed } : {}),
        ...(header ? { headerLevel: header.raw } : {}),
        ...(under ? { underHeader: under } : {})
      };
      
      // Create the meta object with path metadata
      const meta = {
        path: {
          hasVariables: validatedPath.hasVariables
        }
      };
      
      // Create the structured directive
      return helpers.createStructuredDirective(
        'add', 
        'addPath', 
        values, 
        raw, 
        meta, 
        location(),
        'path'  // This variant always uses path as the source
      );
    }

NameList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }
  / _ { return []; }
  
// Special helper rule for variable references in add directive
VariableReference
  = "@" id:Identifier {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id
      }, location());
    }

HeaderLevel
  = _ "as" _ level:("#"+) {
    const value = level.length;
    const raw = level.join('');
    return { 
      value: value,
      raw: raw
    };
  }

UnderHeader
  = _ "under" _ header:TextUntilNewline {
    return header.trim();
  }

// Helper rule for the "as newTitle" part of the Section add directive
AsNewTitle
  = _ "as" _ title:LiteralString {
      return title;
    }