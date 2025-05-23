// MELD BASE SEGMENTS
// Text segment patterns for different contexts

/* 
# Text Segment Abstractions

This file defines base text segment abstractions for different contexts.
Each segment type handles different sets of special characters and
escape sequences based on its intended usage.
*/

// -------------------------------------------------------------
// TEXT SEGMENT PATTERNS
// -------------------------------------------------------------

// Basic text segment - excludes all special characters
BaseTextSegment "Plain text segment"
  = chars:$(![ \t\r\n/\]@${{}"'`] .)+ { 
      helpers.debug('BaseTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// Template text segment - for template content, allows most characters except interpolation
TemplateTextSegment "Template text segment"
  = chars:$(!('{{' / '}}' / '[[' / ']]') .)+ { 
      helpers.debug('TemplateTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// Command text segment - for command content, allows more characters including quotes
CommandTextSegment "Command text segment"
  = chars:$(![/[\]@${}] .)+ { 
      helpers.debug('CommandTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// Path text segment - for path content in brackets, excludes path separators to allow PathSeparator nodes
PathTextSegment "Path text segment"
  = chars:$(![\]/[\]@${}] .)+ { 
      helpers.debug('PathTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// -------------------------------------------------------------
// SEPARATOR NODES
// -------------------------------------------------------------

// Path separator as a distinct node in content
PathSeparator "Path separator"
  = '/' { 
      return helpers.createNode(NodeType.PathSeparator, { value: '/', location: location() });
    }

// Dot separator for field access in content
DotSeparator "Dot separator"
  = '.' { 
      return helpers.createNode(NodeType.DotSeparator, { value: '.', location: location() });
    }

// Section marker as a distinct node in content
SectionMarker "Section marker"
  = '#' { 
      return helpers.createNode(NodeType.SectionMarker, { value: '#', location: location() });
    }