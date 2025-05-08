// MELD BASE WHITESPACE
// Whitespace and line termination patterns

/* 
# Whitespace Abstractions

This file defines whitespace and line termination patterns used throughout
the Meld grammar. These patterns are essential for handling formatting,
logical line boundaries, and directive separation.
*/

// -------------------------------------------------------------
// WHITESPACE PATTERNS
// -------------------------------------------------------------

// Optional whitespace - zero or more whitespace characters
_ "whitespace"
  = [ \t\r\n\u200B\u200C\u200D]*

// Mandatory whitespace - one or more whitespace characters
__ "mandatory whitespace"
  = [ \t\r\n]+

// Horizontal whitespace - only spaces and tabs, no newlines
HWS "horizontal whitespace"
  = [ \t\r\u200B\u200C\u200D]*

// -------------------------------------------------------------
// LINE TERMINATION
// -------------------------------------------------------------

// Line terminator sequence - various newline formats
LineTerminator
  = '\n' / '\r\n' / '\r' / '\u2028' / '\u2029'

// End of file marker
EOF
  = !.
  
// -------------------------------------------------------------
// TEXT UNTIL LINE END
// -------------------------------------------------------------

// Capture text until end of line
TextUntilNewline
  = text:[^\r\n]+ { 
      return text.join(''); 
    }

// End of line with special handling for directives
EndOfLine
  = ws:[ \t\r]* term:LineTerminator &{ 
      const pos = offset();
      const isBeforeDirective = input.substr(pos).match(/^\s*@[a-z]/i);
      return isBeforeDirective;
    } { 
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }
  / ws:[ \t\r]* term:LineTerminator { 
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }
  / ws:[ \t\r]* &{ 
      const atEof = offset() === input.length;
      const nextChar = input[offset()];
      return atEof || (nextChar === '@' && helpers.isLogicalLineStart(input, offset())); 
    } { 
      return helpers.createNode(NodeType.Newline, { content: '\n' }, location());
    }