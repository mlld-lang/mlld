// PATH EXPRESSION PATTERNS
// Unified path handling for both filesystem paths and URLs

/*
# Path Expression System

This file provides a unified PathExpression rule that handles:
- Local filesystem paths (relative and absolute)
- URLs (http, https, file protocols)  
- Section markers (#section) for both
- Variable interpolation (@var) in both

All path-accepting directives should use PathExpression instead of
directly using PathCore, URLPathCore, etc.
*/

// -------------------------------------------------------------
// MAIN PATH EXPRESSION - Entry point for all paths
// -------------------------------------------------------------

PathExpression "Any path expression"
  = UnifiedSectionPath  // [path/file.md#section] or [https://example.com#section]
  / UnifiedPath         // [path/file.md] or [https://example.com]

// -------------------------------------------------------------
// UNIFIED PATHS - Handle both files and URLs with identical syntax
// -------------------------------------------------------------

UnifiedSectionPath "Unified path with section marker"
  = path:UnifiedPath _ "#" _ section:SectionIdentifier {
      helpers.debug('UnifiedSectionPath matched', { path, section });
      
      // Determine if this is a URL or file path based on content
      const isUrl = path.values.protocol !== undefined;
      
      // Section can be either a Text node (literal) or VariableReference node (from AtVar)
      const sectionNodes = Array.isArray(section) ? section : [section];
      
      // Extract raw content for compatibility
      let rawSection;
      if (section.type === 'VariableReference') {
        rawSection = '@' + section.identifier;
      } else if (typeof section === 'string') {
        rawSection = section;
      } else {
        rawSection = section.content || section.identifier || '';
      }
      
      if (isUrl) {
        return {
          type: 'path',
          subtype: 'urlSectionPath',
          values: { 
            url: path.values.url,
            protocol: path.values.protocol,
            parts: path.values.parts,
            section: sectionNodes
          },
          raw: { 
            url: path.raw.url || path.raw.path,
            protocol: path.values.protocol,
            section: rawSection
          },
          meta: helpers.createUrlMetadata(path.values.protocol, path.values.parts, true)
        };
      } else {
        return {
          type: 'path',
          subtype: 'fileSectionPath',
          values: { 
            path: path.values.path,
            section: sectionNodes
          },
          raw: { 
            path: path.raw.path,
            section: rawSection
          },
          meta: {
            ...path.meta,
            hasSection: true
          }
        };
      }
    }

UnifiedPath "Unified path (file or URL)"
  = path:WrappedPathContent {
      helpers.debug('UnifiedPath matched', { path });
      
      // Analyze the raw content to determine if this is a URL or file path
      const rawContent = path.raw;
      const urlMatch = rawContent.match(/^(https?|file):\/\//);
      
      if (urlMatch) {
        // This is a URL - parse it as such
        const protocol = urlMatch[1];
        const fullUrl = rawContent;
        
        helpers.debug('UnifiedPath detected URL', { protocol, fullUrl });
        
        return {
          type: 'path',
          subtype: 'urlPath',
          values: { 
            url: [helpers.createNode(NodeType.Text, { content: fullUrl, location: location() })],
            protocol: [helpers.createNode(NodeType.Text, { content: protocol, location: location() })],
            parts: path.parts
          },
          raw: { 
            url: fullUrl,
            protocol
          },
          meta: helpers.createUrlMetadata(protocol, path.parts)
        };
      } else {
        // This is a file path
        helpers.debug('UnifiedPath detected file path', { rawContent });
        
        return {
          type: 'path',
          subtype: 'filePath',
          values: { 
            path: path.parts 
          },
          raw: { 
            path: path.raw 
          },
          meta: helpers.createPathMetadata(path.raw, path.parts)
        };
      }
    }

// URL protocol (http, https, file)
URLProtocolType "URL protocol type"
  = proto:$("http" "s"? / "file") {
      return proto;
    }

// URL content after protocol
URLRest "URL content"
  = "//" parts:URLParts {
      const raw = "//" + parts.map(p => {
        if (p.type === NodeType.VariableReference) {
          return '@' + p.identifier;
        }
        return p.content || p;
      }).join('');
      
      return { parts, raw };
    }

// URL parts with variable interpolation support
URLParts "URL parts"
  = parts:(URLEscapedBackslash / URLEscapedAt / URLVariableRef / URLSegment)+ {
      return parts;
    }

// Escaped backslash in URL
URLEscapedBackslash "Escaped backslash in URL"
  = "\\\\" {
      return helpers.createNode(NodeType.Text, { 
        content: '\\', 
        location: location() 
      });
    }

// Escaped @ symbol in URL
URLEscapedAt "Escaped @ in URL"
  = "\\@" {
      return helpers.createNode(NodeType.Text, { 
        content: '@', 
        location: location() 
      });
    }

// Variable reference in URL
URLVariableRef "URL variable reference"
  = "@" varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('url', { 
        identifier: varName,
        location: location()
      });
    }

// Regular URL segment (everything except @, \, and whitespace)
URLSegment "URL segment"
  = chars:$([^@\\\s\n]+) {
      return helpers.createNode(NodeType.Text, { 
        content: chars, 
        location: location() 
      });
    }

// -------------------------------------------------------------
// SECTION IDENTIFIER PATTERNS
// -------------------------------------------------------------

// Section identifier - supports both literal names and variable references
// Used in: UnifiedSectionPath for dynamic section extraction
SectionIdentifier "Section name or variable reference"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      // Variable reference in section context - no VariableContext check needed
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / BaseIdentifier {  // literal section names (e.g., "Introduction")
      return helpers.createNode(NodeType.Text, { 
        content: text(), 
        location: location() 
      });
    }

// -------------------------------------------------------------
// LEGACY URL HELPER RULES - Keep for backward compatibility
// These are used by the UnifiedPath system for URL parsing
// -------------------------------------------------------------