EmbedDirective
  = "embed" embedResult:_EmbedRHS headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      const directiveData = {
        ...embedResult,
        ...(headerLevel ? { headerLevel } : {}),
        ...(underHeader ? { underHeader } : {})
      };

      return helpers.createDirective('embed', directiveData, location());
    }
  / "embed" _ "[[" content:MultilineContent "]]" _ HWS DirectiveEOL {
    return helpers.createDirective('embed', {
      subtype: 'embedMultiline',
      content: content,
    }, location());
  }
  / "embed" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? DirectiveEOL {
    const [path, section] = content.split('#');
    const sectionTrimmed = section ? section.trim() : null;
    
    helpers.validateEmbedPath(path);
    
    return helpers.createDirective('embed', {
      subtype: 'embedPath',
      path: helpers.validatePath(path),
      ...(sectionTrimmed ? { section: sectionTrimmed } : {}),
      names,
      ...(options ? { options } : {}),
      ...(header ? { headerLevel: header } : {}),
      ...(under ? { underHeader: under } : {})
    }, location());
  }

NameList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }
  / _ { return []; }

HeaderLevel
  = _ "as" _ level:("#"+) {
    return level.length;
  }

UnderHeader
  = _ "under" _ header:TextUntilNewline {
    return header.trim();
  }

// Helper rule for parsing RHS @embed variations
// Returns { subtype: '...', ... } structure without 'source' field.
_EmbedRHS
   = _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" _[ \t]* options:DirectiveOptions? {
     return {
       subtype: 'embedTemplate',
       content: content,
       isTemplateContent: true,
       ...(options ? { options } : {})
     };
   }
   / _ "[" content:BracketInterpolatableContentOrEmpty "]" options:DirectiveOptions? {
     // 1. Find section marker and split the array
     const sectionMarkerIndex = content.findIndex(p => p.type === NodeType.SectionMarker);
     const pathParts = sectionMarkerIndex === -1 ? content : content.slice(0, sectionMarkerIndex);
     const sectionParts = sectionMarkerIndex === -1 ? [] : content.slice(sectionMarkerIndex + 1);

     // DEBUG: Log pathParts before flag calculation
     helpers.debug('EMBED_RHS_PRE_FLAGS', 'PathParts before flag calc:', JSON.stringify(pathParts));

     // 2. Reconstruct raw strings (using the fixed helper)
     const rawPath = helpers.reconstructRawString(content).trim();
     const rawSection = helpers.reconstructRawString(sectionParts).trim() || null;
     const pathOnly = helpers.reconstructRawString(pathParts).trim();

     // 3. Split content into path parts and section
     helpers.debug('EMBED_RHS_CONTENT', 'Full content:', JSON.stringify(content));
     helpers.debug('EMBED_RHS_PATH_PARTS', 'Path parts:', JSON.stringify(pathParts));
     // Validate path using only the path-portion (before any # section)
     const finalPathObject = helpers.validatePath(pathParts, DirectiveKind.embed);
     finalPathObject.raw = pathOnly;
     finalPathObject.values = content; // Keep all parts including section

     helpers.debug('EmbedPath_New', { rawPath, rawSection, finalPathObject, content });

     return {
       kind: 'embed',
       subtype: 'embedPath',
       path: finalPathObject,
       ...(rawSection ? { section: rawSection } : {}),
       ...(options ? { options } : {})
     };
   }
   / _ variable:Variable options:DirectiveOptions? {
      // Handle variable references (e.g. {{variable}} or {{users[0].roles[1]}})
      return {
        subtype: 'embedVariable',
        values: [variable],
        ...(options ? { options } : {})
      };
    }
