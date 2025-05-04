// meld.pegjs
// Meld grammar implementation

{
  // NodeType, DirectiveKind, and helpers are injected via parser-dependencies
}

// structural newline that should become an AST node
InterDirectiveNewline
  = ws:[ \t\r]* term:LineTerminator &{
      /* scan forward past spaces/tabs (NOT newlines) */
      let i = offset();
      while (i < input.length && (input[i] === ' ' || input[i] === '\t' || input[i] === '\r')) {
        i++;
      }
      /* success only if the next real char starts a directive line */
      return i < input.length && input[i] === '@' && helpers.isLogicalLineStart(input, i);
    } {
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }

// plain newline that should stay a raw string
ContentEOL
  = ws:[ \t\r]* term:LineTerminator { return term; }

// peek for newline/EOF without consuming
DirectiveEOL
  = &( LineTerminator / EOF )
  / _[ \t\r]* &( LineTerminator / EOF )

Start
  = nodes:(
      LineStartComment
    / Comment
    / CodeFence
    / Variable
    / Directive              /* <— first try to match directives */
    / InterDirectiveNewline   /* <— then capture newlines between directives */
    / TextBlock
    )* {
    helpers.debug('Start: Entered');
    return nodes;
  }

LineStartComment
  = &{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      return isAtLineStart;
    } ">>" [ ] content:CommentContent {
    return helpers.createNode(NodeType.Comment, { content: content.trim() }, location());
  }

Comment
  = ">>" [ ] content:CommentContent {
    return helpers.createNode(NodeType.Comment, { content: content.trim() }, location());
  }

CommentContent
  = chars:[^\n]* "\n"? {
    return chars.join('');
  }

TextBlock
  = first:TextPart rest:(TextPart)* {
    return helpers.createNode(NodeType.Text, { content: first + rest.join('') }, location());
  }

TextPart
  = !{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      const isDirective = isAtLineStart && input.substr(pos, 1) === '@' && 
                         /[a-z]/.test(input.substr(pos+1, 1));
      
      const isComment = isAtLineStart && input.substr(pos, 2) === '>>';
      
      return isDirective || isComment;
    } !(
       "{{"           /* still block the opening of a text-var */
     / "}}"           /* …and its closing */
     / "[["           /* block multiline-template opening */
     / "]]"           /* …and its closing */
     / BacktickSequence  /* keep blocking fence openers (``, ``` etc.) */
    ) &{
      const pos = offset();
      helpers.trace(pos, 'brace/backtick guard');
      return true;
    } char:. { 
      return char; 
    }

Directive
  = &{ return helpers.isLogicalLineStart(input, offset()); }
    [ \t]* "@"                       // allow leading tabs/spaces
    dir:(
      ImportDirective   // Standard import syntax
    / EmbedDirective
    / RunDirective
    / DefineDirective
    / DataDirective
    / TextDirective
    / PathDirective
    / VarDirective
    ) { return dir; }

CodeFence
  = opener:BacktickSequence lang:CodeFenceLangID? "\n"
    content:(!(&{ return true; } closer:BacktickSequence &{
      return closer.length === opener.length;
    }) c:. { return c; })*
    closer:BacktickSequence !{
      return closer.length !== opener.length;
    } "\n"? {
      const rawContent = content.join('');
      const preserveCodeFences = options?.preserveCodeFences !== false;
      const finalContent = preserveCodeFences 
        ? opener.join('') + (lang ? lang : '') + '\n' + rawContent + (rawContent ? '' : '\n') + closer.join('')
        : rawContent.trimEnd();
      return helpers.createNode(NodeType.CodeFence, {
        language: lang || undefined,
        content: finalContent
      }, location());
    }

CodeFenceLangID
  = chars:[^`\r\n]+ { return chars.join(''); }

