// PATH CORE
// Core content handler for filesystem paths with variable interpolation

/* 
# Path Content Core

This file provides core path content handling that can be used by:
- @import directive for file imports
- Potentially @add directive if path variant is added

Paths can contain:
- Filesystem paths (absolute or relative)
- Variable interpolation with @var
- Path separators (/)
*/

// Import base patterns
import './base/context.peggy';
import './base/tokens.peggy';
import './base/whitespace.peggy';
import './patterns/variables.peggy';
import './patterns/content.peggy';

// -------------------------------------------------------------
// PATH CORE - Standard path with interpolation
// -------------------------------------------------------------

PathCore
  = path:WrappedPathContent {
      helpers.debug('PathCore matched path', { path });
    
      // Examine path for special attributes (absolute vs relative)
      const isAbsolute = path.raw.startsWith('/');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(path.raw);
      const extension = hasExtension ? 
        path.raw.substring(path.raw.lastIndexOf('.') + 1) : null;
    
      // Structure for outputting a filesystem path
      return {
        type: 'path',
        subtype: 'filesystemPath',
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

// -------------------------------------------------------------
// SECTION PATH CORE - Path with section marker (#)
// -------------------------------------------------------------

SectionPathCore
  = path:WrappedPathContent _ "#" _ section:BaseIdentifier {
      helpers.debug('SectionPathCore matched', { path, section });
      
      // Path with section marker for specific imports
      return {
        type: 'path',
        subtype: 'sectionPath',
        values: { 
          path: path.parts,
          section
        },
        raw: { 
          path: path.raw,
          section
        },
        meta: {
          isAbsolute: path.raw.startsWith('/'),
          hasSection: true,
          hasVariables: path.parts.some(part => 
            part && part.type === NodeType.VariableReference
          )
        }
      };
    }

// -------------------------------------------------------------
// URL PATH CORE - URL-based paths with protocol
// -------------------------------------------------------------

URLPathCore
  = protocol:URLProtocol ":" rest:URLContent {
      const fullUrl = `${protocol}:${rest}`;
      helpers.debug('URLPathCore matched', { fullUrl });
      
      // URL path with protocol
      return {
        type: 'path',
        subtype: 'urlPath',
        values: { 
          url: fullUrl,
          protocol
        },
        raw: { 
          url: fullUrl,
          protocol
        },
        meta: {
          isUrl: true,
          protocol
        }
      };
    }

// URL protocol and content
URLProtocol
  = proto:$("http" "s"? / "file") {
      return proto;
    }

URLContent
  = content:$("//" [^\\s\\n]+) {
      return content;
    }