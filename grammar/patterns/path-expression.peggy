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
  = URLSectionPath      // https://example.com/file.md#section
  / URLPath             // https://example.com/file.md
  / FileSectionPath     // path/to/file.md#section  
  / FilePath            // path/to/file.md

// -------------------------------------------------------------
// URL PATHS - Remote resources with protocol
// -------------------------------------------------------------

URLSectionPath "URL with section marker"
  = url:URLPath _ "#" _ section:BaseIdentifier {
      helpers.debug('URLSectionPath matched', { url, section });
      
      return {
        type: 'path',
        subtype: 'urlSectionPath',
        values: { 
          url: url.values.url,
          protocol: url.values.protocol,
          parts: url.values.parts,
          section
        },
        raw: { 
          url: url.raw.url,
          protocol: url.raw.protocol,
          section
        },
        meta: {
          isUrl: true,
          protocol: url.values.protocol,
          hasVariables: url.meta.hasVariables,
          hasSection: true
        }
      };
    }

URLPath "URL path"
  = protocol:URLProtocol ":" rest:URLRest {
      const fullUrl = `${protocol}:${rest.raw}`;
      helpers.debug('URLPath matched', { protocol, fullUrl });
      
      return {
        type: 'path',
        subtype: 'urlPath',
        values: { 
          url: fullUrl,
          protocol,
          parts: rest.parts
        },
        raw: { 
          url: fullUrl,
          protocol
        },
        meta: {
          isUrl: true,
          protocol,
          hasVariables: rest.parts.some(part => 
            part && part.type === NodeType.VariableReference
          )
        }
      };
    }

// URL protocol (http, https, file)
URLProtocol "URL protocol"
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
  = parts:(URLVariableRef / URLSegment)+ {
      return parts;
    }

// Variable reference in URL
URLVariableRef "URL variable reference"
  = "@" var:ValidIdentifier {
      return helpers.createVariableReferenceNode('url', { 
        identifier: var,
        location: location()
      });
    }

// Regular URL segment (everything except @ and whitespace)
URLSegment "URL segment"
  = chars:$([^@\s\n]+) {
      return helpers.createNode(NodeType.Text, { 
        content: chars, 
        location: location() 
      });
    }

// -------------------------------------------------------------
// FILE PATHS - Local filesystem paths
// -------------------------------------------------------------

FileSectionPath "File path with section marker"
  = path:FilePath _ "#" _ section:BaseIdentifier {
      helpers.debug('FileSectionPath matched', { path, section });
      
      return {
        type: 'path',
        subtype: 'fileSectionPath',
        values: { 
          path: path.values.path,
          section
        },
        raw: { 
          path: path.raw.path,
          section
        },
        meta: {
          isAbsolute: path.meta.isAbsolute,
          hasExtension: path.meta.hasExtension,
          extension: path.meta.extension,
          hasVariables: path.meta.hasVariables,
          hasSection: true
        }
      };
    }

FilePath "File path"
  = path:WrappedPathContent {
      helpers.debug('FilePath matched', { path });
      
      // Examine path for special attributes
      const isAbsolute = path.raw.startsWith('/');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(path.raw);
      const extension = hasExtension ? 
        path.raw.substring(path.raw.lastIndexOf('.') + 1) : null;
      
      return {
        type: 'path',
        subtype: 'filePath',
        values: { 
          path: path.parts 
        },
        raw: { 
          path: path.raw 
        },
        meta: {
          isAbsolute,
          hasExtension,
          extension,
          hasVariables: path.parts.some(part => 
            part && part.type === NodeType.VariableReference
          )
        }
      };
    }