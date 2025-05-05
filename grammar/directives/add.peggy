AddDirective
  = "add" addResult:_AddRHS headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Add header level and under header to values and raw if present
      let values = { ...addResult.values };
      let raw = { ...addResult.raw };
      let meta = { ...addResult.meta };
      
      if (headerLevelValue !== null) {
        // Create a node and put it in an array for consistency
        const headerLevelNode = helpers.createNode(NodeType.Number, { 
          value: headerLevelValue.value,
          raw: headerLevelValue.raw
        });
        values.headerLevel = [headerLevelNode];
        raw.headerLevel = headerLevel.raw;
      }
      
      if (underHeaderValue !== null) {
        values.underHeader = [helpers.createNode(NodeType.Text, { content: underHeaderValue, raw: underHeaderValue })];
        raw.underHeader = underHeaderValue;
      }

      // Determine source based on subtype
      let source = null;
      if (addResult.subtype === 'addTemplate') {
        source = 'template';
      } else if (addResult.subtype === 'addPath') {
        source = 'path';
      } else if (addResult.subtype === 'addVariable') {
        source = 'variable';
      }
      
      // Create the structured directive
      return helpers.createStructuredDirective(
        'add', 
        addResult.subtype, 
        values, 
        raw, 
        meta, 
        location(),
        source
      );
    }
  / "add" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? DirectiveEOL {
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
          isAbsolute: validatedPath.isAbsolute,
          hasVariables: validatedPath.hasVariables,
          hasTextVariables: validatedPath.hasTextVariables,
          hasPathVariables: validatedPath.hasPathVariables,
          isRelative: validatedPath.isRelativeToCwd
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

// Helper rule for parsing RHS @add variations
// Returns structured values, raw, meta objects for different subtypes
_AddRHS
  = _ "[" content:BracketInterpolatableContentOrEmpty "]" _[ \t]* options:DirectiveOptions? {
    // Create the values object with content node array
    const values = {
      content
    };
    
    // Create the raw object with raw content
    const raw = {
      content: helpers.reconstructRawString(content)
    };
    
    // Create the meta object with isTemplateContent flag
    const meta = {
      isTemplateContent: true
    };
    
    return {
      subtype: 'addTemplate',
      values,
      raw,
      meta
    };
  }
  / _ path:StringLiteral options:DirectiveOptions? {
    // Extract potential section from the path string
    const pathValue = path.value || '';
    const [pathPart, sectionPart] = pathValue.split('#');
    const pathTrimmed = pathPart ? pathPart.trim() : pathValue;
    const sectionTrimmed = sectionPart ? sectionPart.trim() : null;
    
    // Create validated path node
    const pathNode = helpers.createNode(NodeType.StringLiteral, {
      value: pathTrimmed,
      raw: path.raw
    });
    
    // Validate the path
    const validatedPath = helpers.validatePath(pathNode, { context: 'addPath' });
    
    // Create values object
    const values = {
      path: [validatedPath]
    };
    
    // Add section if present
    if (sectionTrimmed) {
      values.section = [helpers.createNode(NodeType.Text, { 
        content: sectionTrimmed, 
        raw: sectionTrimmed 
      })];
    }
    
    // Create raw object
    const raw = {
      path: path.raw
    };
    
    // Add section to raw if present
    if (sectionTrimmed) {
      raw.section = sectionTrimmed;
    }
    
    // Create meta object with path metadata
    const meta = {
      path: {
        isAbsolute: validatedPath.isAbsolute,
        hasVariables: validatedPath.hasVariables,
        hasTextVariables: validatedPath.hasTextVariables,
        hasPathVariables: validatedPath.hasPathVariables,
        isRelative: validatedPath.isRelativeToCwd
      }
    };
    
    return {
      subtype: 'addPath',
      values,
      raw,
      meta
    };
  }
  / _ variable:Variable options:DirectiveOptions? {
    // Create the values object with variable node array
    const values = {
      variable: [variable]
    };
    
    // Create the raw object with raw variable
    const raw = {
      variable: variable.raw
    };
    
    // Create empty meta object for variable embedding
    const meta = {};
    
    return {
      subtype: 'addVariable',
      values,
      raw,
      meta
    };
  }