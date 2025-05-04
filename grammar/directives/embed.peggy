EmbedDirective
  = "embed" embedResult:_EmbedRHS headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      // Extract header level and under header if provided
      const headerLevelValue = headerLevel ? headerLevel : null;
      const underHeaderValue = underHeader ? underHeader : null;
      
      // Add header level and under header to values and raw if present
      let values = { ...embedResult.values };
      let raw = { ...embedResult.raw };
      let meta = { ...embedResult.meta };
      
      if (headerLevelValue !== null) {
        values.headerLevel = headerLevelValue;
        raw.headerLevel = headerLevel.raw;
      }
      
      if (underHeaderValue !== null) {
        values.underHeader = [helpers.createNode(NodeType.Text, { content: underHeaderValue, raw: underHeaderValue })];
        raw.underHeader = underHeaderValue;
      }

      // Create the structured directive
      return helpers.createStructuredDirective(
        'embed', 
        embedResult.subtype, 
        values, 
        raw, 
        meta, 
        location()
      );
    }
  / "embed" _ "[[" content:MultilineContent "]]" _ HWS DirectiveEOL {
      // Create the values object with content node array
      const values = {
        content: [helpers.createNode(NodeType.Text, { content, raw: content })]
      };
      
      // Create the raw object with raw content
      const raw = {
        content
      };
      
      // Create the meta object (empty for multiline)
      const meta = {};
      
      // Create the structured directive
      return helpers.createStructuredDirective(
        'embed', 
        'embedMultiline', 
        values, 
        raw, 
        meta, 
        location()
      );
    }
  / "embed" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? DirectiveEOL {
      // Extract path and optional section from content
      const [path, section] = content.split('#');
      const sectionTrimmed = section ? section.trim() : null;
      
      // Validate the path
      const validatedPath = helpers.validatePath(helpers.createNode(NodeType.Text, { content: path.trim(), raw: path.trim() }), { context: 'embedPath' });
      
      // Create variable nodes for the names
      const nameNodes = names.map(name => 
        helpers.createVariableReferenceNode('identifier', { identifier: name })
      );
      
      // Create the values object
      const values = {
        path: [validatedPath],
        names: nameNodes,
        ...(sectionTrimmed ? { section: [helpers.createNode(NodeType.Text, { content: sectionTrimmed, raw: sectionTrimmed })] } : {}),
        ...(header ? { headerLevel: header } : {}),
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
        'embed', 
        'embedPath', 
        values, 
        raw, 
        meta, 
        location()
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
    return { 
      value: value,
      raw: level.join('')
    };
  }

UnderHeader
  = _ "under" _ header:TextUntilNewline {
    return header.trim();
  }

// Helper rule for parsing RHS @embed variations
// Returns structured values, raw, meta objects for different subtypes
_EmbedRHS
  = _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" _[ \t]* options:DirectiveOptions? {
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
      subtype: 'embedTemplate',
      values,
      raw,
      meta
    };
  }
  / _ "[" content:BracketInterpolatableContentOrEmpty "]" options:DirectiveOptions? {
    // Find section marker and split the array
    const sectionMarkerIndex = content.findIndex(p => p.type === NodeType.SectionMarker);
    const pathParts = sectionMarkerIndex === -1 ? content : content.slice(0, sectionMarkerIndex);
    const sectionParts = sectionMarkerIndex === -1 ? [] : content.slice(sectionMarkerIndex + 1);

    // Reconstruct raw strings
    const rawContent = helpers.reconstructRawString(content).trim();
    const rawPath = helpers.reconstructRawString(pathParts).trim();
    const rawSection = helpers.reconstructRawString(sectionParts).trim() || null;
    
    // Validate the path
    const validatedPath = helpers.validatePath(pathParts, { context: 'embedPath' });
    
    // Create the values object
    const values = {
      path: pathParts,
      ...(sectionParts.length > 0 ? { section: sectionParts } : {})
    };
    
    // Create the raw object
    const raw = {
      path: rawPath,
      ...(rawSection ? { section: rawSection } : {})
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
    
    return {
      subtype: 'embedPath',
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
      subtype: 'embedVariable',
      values,
      raw,
      meta
    };
  }