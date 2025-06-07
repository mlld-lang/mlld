// MLLD BASE SEGMENTS
// Text segment patterns for different contexts

/* 
# Text Segment Abstractions

This file defines base text segment abstractions for different contexts.
Each segment type handles different sets of special characters and
escape sequences based on its intended usage.
*/

// -------------------------------------------------------------
// ESCAPE SEQUENCES
// -------------------------------------------------------------

// Universal escape sequence - returns the literal character
EscapeSequence "Escape sequence"
  = "\\" char:("@" / "\\" / "[" / "]" / "{" / "}" / '"' / "'" / "`" / "$") {
      return char === "\\" ? "\\" : char;
    }

// String escape sequence - processes standard string escapes like \n, \t
StringEscapeSequence "String escape sequence"
  = "\\" char:("n" / "t" / "r" / "0" / "\\" / '"' / "'") {
      switch (char) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case '0': return '\0';
        case '\\': return '\\';
        case '"': return '"';
        case "'": return "'";
        default: return char;
      }
    }

// -------------------------------------------------------------
// TEXT SEGMENT PATTERNS
// -------------------------------------------------------------

// Basic text segment - excludes all special characters
BaseTextSegment "Plain text segment"
  = chars:BaseChar+ { 
      const content = chars.join('');
      helpers.debug('BaseTextSegment matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

BaseChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / ![ \t\r\n/\]@${{}"'`] char:. { return char; }

// Template text segment - for template content, with escape support
TemplateTextSegment "Template text segment"
  = chars:TemplateChar+ { 
      const content = chars.join('');
      helpers.debug('TemplateTextSegment matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

TemplateChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / !('{{' / '}}' / '[[' / ']]') char:. { return char; }

// Command text segment - for command content, with escape support
CommandTextSegment "Command text segment"
  = chars:CommandChar+ { 
      const content = chars.join('');
      helpers.debug('CommandTextSegment matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

CommandChar
  = EscapeSequence
  / ![/[\]@${}] char:. { return char; }

// Path text segment - for path content in brackets, with escape support
PathTextSegment "Path text segment"
  = chars:PathChar+ { 
      const content = chars.join('');
      helpers.debug('PathTextSegment matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

PathChar
  = EscapeSequence
  / &{ 
      // Check if we're at a section marker
      const rest = input.substring(peg$currPos);
      return !rest.match(/^\s*#\s*/);
    } ![\]/[\]@${}] char:. { return char; }

// Section text segment - for section names after #, with escape support
SectionTextSegment "Section text segment"
  = chars:SectionChar+ { 
      const content = chars.join('');
      helpers.debug('SectionTextSegment matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

SectionChar
  = EscapeSequence
  / ![\]] char:. { return char; }

// -------------------------------------------------------------
// ESCAPE-AWARE STRING CONTENT  
// -------------------------------------------------------------

// Text with escape sequences for double-quoted string literals
EscapedStringContent "String content with escapes"
  = chars:EscapedStringChar* {
      return chars.join('');
    }

EscapedStringChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / !'"' char:. { return char; }

// Text with escape sequences for single-quoted strings
EscapedSingleStringContent "Single-quoted string content with escapes"
  = chars:EscapedSingleStringChar* {
      return chars.join('');
    }

EscapedSingleStringChar
  = EscapeSequence
  / !"'" char:. { return char; }

// Text with escape sequences for backtick strings
EscapedBacktickStringContent "Backtick string content with escapes"
  = chars:EscapedBacktickStringChar* {
      return chars.join('');
    }

EscapedBacktickStringChar
  = EscapeSequence
  / !"`" char:. { return char; }

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