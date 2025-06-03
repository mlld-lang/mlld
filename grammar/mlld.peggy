// mlld.pegjs
// Mlld grammar implementation - Refactored Version

{
  // NodeType, DirectiveKind, and helpers are injected via parser-dependencies
  
  // Initialize options for context tracking
  if (typeof options !== 'undefined') {
    options.rhsDirectiveType = '';
    options.afterDirectiveType = '';
  }
}

// -------------------------------------------------------------------------
// STRUCTURE NOTE: The build process concatenates files in this order:
// -------------------------------------------------------------------------
// 1. This root file (mlld.peggy)
// 2. Base components (context.peggy, tokens.peggy, etc.)
// 3. Pattern abstractions (variables.peggy, content.peggy, etc.)
// 4. Core content handlers (template.peggy, command.peggy, etc.)
// 5. Directive implementations (run.peggy, text.peggy, etc.)
//
// No explicit imports are needed as the build script handles file inclusion.

// -------------------------------------------------------------------------
// DOCUMENT STRUCTURE
// -------------------------------------------------------------------------

// Main entry point - processes a complete document
Start
  = frontmatter:Frontmatter? nodes:(
      LineStartComment
    / Comment
    / CodeFence
    / Directive              /* <— first try to match directives */
    / Variable               /* <— Then try to match variables (moved after directives) */
    / InterDirectiveNewline  /* <— then capture newlines between directives */
    / TextBlock
    )* {
    helpers.debug('Start: Entered');
    const result = [];
    if (frontmatter) result.push(frontmatter);
    result.push(...nodes);
    return result;
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
      return helpers.createNode(NodeType.Newline, { content: term, location: location() });
    }

// plain newline that should stay a raw string
ContentEOL
  = ws:[ \t\r]* term:LineTerminator { return term; }

// peek for newline/EOF without consuming
DirectiveEOL
  = &( LineTerminator / EOF )
  / _[ \t\r]* &( LineTerminator / EOF )

// -------------------------------------------------------------------------
// COMMENTS
// -------------------------------------------------------------------------

LineStartComment
  = &{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      return isAtLineStart;
    } marker:CommentMarker _ content:CommentContent {
    return helpers.createNode(NodeType.Comment, { 
      content: content.trim(), 
      marker: marker,
      location: location() 
    });
  }

Comment
  = marker:CommentMarker _ content:CommentContent {
    return helpers.createNode(NodeType.Comment, { 
      content: content.trim(), 
      marker: marker,
      location: location() 
    });
  }

// Support both >> and << as comment markers
CommentMarker
  = ">>" { return ">>"; }
  / "<<" { return "<<"; }

CommentContent
  = chars:[^\n]* "\n"? {
    return chars.join('');
  }

// Inline comment pattern - for use after directive content
InlineComment
  = _ marker:CommentMarker _ content:CommentContent {
    return {
      type: 'Comment',
      marker: marker,
      content: content.trim(),
      location: location()
    };
  }

// -------------------------------------------------------------------------
// TEXT BLOCKS
// -------------------------------------------------------------------------

  TextBlock
    = first:TextPart rest:(TextPart)* {
    return helpers.createNode(NodeType.Text, { content: first + rest.join(''), location: location() });
  }

TextPart
  = !{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      const isAtStartChar = input[pos] === '@';
      
      // Is this potentially a directive?
      if (isAtLineStart && isAtStartChar) {
        // Check if we're at a directive context
        return helpers.isAtDirectiveContext(input, pos);
      }
      
      // For regular comment handling
      const isComment = isAtLineStart && input.substr(pos, 2) === '>>';
      
      return isAtLineStart && isAtStartChar || isComment;
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

// -------------------------------------------------------------------------
// TOP-LEVEL DIRECTIVES
// -------------------------------------------------------------------------

Directive
  = &{ return helpers.isLogicalLineStart(input, offset()); }
    [ \t]*                        // allow leading tabs/spaces
    dir:(
      AtRun          // Run directives (commands, code)
    / AtExec         // Exec directives (define commands/code)
    / AtText         // Text directives (templates)
    / AtImport       // Import directives (from other files)
    / AtAdd          // Add directives (content inclusion)
    / AtData         // Data directives (structured data)
    / AtPath         // Path directives (path variables)
    / AtOutput       // Output directives (output routing)
    / AtWhen         // When directives (conditional execution)
    ) { return dir; }

// -------------------------------------------------------------------------
// CODE FENCES
// -------------------------------------------------------------------------

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
        content: finalContent,
        location: location()
      });
    }

CodeFenceLangID
  = chars:[^`\r\n]+ { return chars.join(''); }

// -------------------------------------------------------------------------
// IMPORTED DIRECTIVES
// -------------------------------------------------------------------------

// All the AtDirectives are now imported from their respective files:
// - AtRun from directives/run.peggy
// - AtExec from directives/exec.peggy
// - AtText from directives/text.peggy
// - AtImport from directives/import.peggy
// - AtAdd from directives/add.peggy
// - AtData from directives/data.peggy
// - AtPath from directives/path.peggy
// - AtOutput from directives/output.peggy
// - AtWhen from directives/when.peggy