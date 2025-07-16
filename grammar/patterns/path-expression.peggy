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

// REMOVED: PathExpression with bracket syntax
// PathExpression should now use quoted strings or alligator syntax
PathExpression "Any path expression"
  = QuotedStringPath  // "path/to/file.md" - for import/path directives

// Simple quoted string path
QuotedStringPath "quoted string path"
  = '"' content:$([^"]*) '"' {
      return {
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
    }
  / "'" content:$([^']*) "'" {
      return {
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
    }

// -------------------------------------------------------------
// UNIFIED PATHS - Removed: bracket syntax no longer supported
// Use quoted strings or alligator syntax for paths instead
// -------------------------------------------------------------

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
  = VariableNoTail
  / '"' content:$(!'"' .)* '"' {  // Double-quoted section names
      return helpers.createNode(NodeType.Text, { 
        content: content, 
        location: location() 
      });
    }
  / "'" content:$(!"'" .)* "'" {  // Single-quoted section names
      return helpers.createNode(NodeType.Text, { 
        content: content, 
        location: location() 
      });
    }
  / chars:SectionNameChar+ {  // Unquoted section names
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

// Characters allowed in unquoted section names - everything except ], quotes, and newlines
SectionNameChar
  = ![\]"'\r\n] char:. { return char; }

// -------------------------------------------------------------
// LEGACY URL HELPER RULES - Keep for backward compatibility
// These are used by the UnifiedPath system for URL parsing
// -------------------------------------------------------------