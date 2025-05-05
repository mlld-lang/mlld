// --- Whitespace ---

_ "whitespace"
  = [ \t\r\n\u200B\u200C\u200D]*

__ "mandatory whitespace"
  = [ \t\r\n]+

HWS "horizontal whitespace"
  = [ \t\r\u200B\u200C\u200D]*

// --- Line Terminators ---

LineTerminator
  = '\n' / '\r\n' / '\r' / '\u2028' / '\u2029'

EOF
  = !.
  
// --- Text Until End of Line ---

// Simple text until the end of line
TextUntilNewline
  = text:[^\r\n]+ { 
    return text.join(''); 
  }

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
