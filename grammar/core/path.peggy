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


// -------------------------------------------------------------
// PATH CORE - Standard path with interpolation
// -------------------------------------------------------------

PathCore
  = path:PathExpression {
      helpers.debug('PathCore matched path', { path });
    
      // Structure for outputting a filesystem path
      return {
        type: 'path',
        subtype: 'filesystemPath',
        values: { 
          path: path.values.path || path.values.url 
        },
        raw: { 
          path: path.raw.path || path.raw.url 
        },
        meta: path.meta
      };
    }

// -------------------------------------------------------------
// SECTION PATH CORE - Path with section marker (#)
// -------------------------------------------------------------

SectionPathCore
  = path:PathExpression _ "#" _ section:BaseIdentifier {
      helpers.debug('SectionPathCore matched', { path, section });
      
      // Path with section marker for specific imports
      return {
        type: 'path',
        subtype: 'sectionPath',
        values: { 
          path: path.values.path || path.values.url,
          section: [helpers.createNode(NodeType.Text, { content: section, location: location() })]
        },
        raw: { 
          path: path.raw.path || path.raw.url,
          section
        },
        meta: {
          ...path.meta,
          hasSection: true
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
          url: [helpers.createNode(NodeType.Text, { content: fullUrl, location: location() })],
          protocol: [helpers.createNode(NodeType.Text, { content: protocol, location: location() })]
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