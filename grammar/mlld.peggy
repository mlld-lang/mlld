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
      LineStartComment           /* <— Comments get highest priority! */
    / Comment                    /* <— Any other comments */
    / MlldRunFence               /* <— Special mlld-run blocks that are interpreted */
    / CodeFence                  /* <— Regular code blocks that are NOT interpreted */
    / Directive                  /* <— Directives come after comments */
    / Variable                   /* <— Then try to match variables */
    / TextBlock                  /* <— Finally, plain text */
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
      return i < input.length && input[i] === '/' && helpers.isLogicalLineStart(input, i);
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
      
      // Check for directive start
      if (isAtLineStart && input[pos] === '/') {
        return helpers.isAtDirectiveContext(input, pos);
      }
      
      // Check for comment start
      if (isAtLineStart && input[pos] === '>' && input[pos + 1] === '>') {
        return true; // Stop parsing text - it's a comment
      }
      
      return false; // Continue parsing text
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
      AtVarDirective // NEW: Var directives (unified variable assignment)
    / AtShow         // NEW: Show directives (content display) - replaces AtAdd
    / AtExe          // NEW: Exe directives (define commands/code) - replaces AtExec
    / AtRun          // Run directives (commands, code)
    / AtPath         // Path directives (path variables)
    / AtImport       // Import directives (from other files)
    / AtOutput       // Output directives (output routing)
    / AtWhen         // When directives (conditional execution)
    // NO AtText, AtData, AtAdd, AtExec - deleted!
    ) { return dir; }

// -------------------------------------------------------------------------
// CODE FENCES
// -------------------------------------------------------------------------

// Special mlld-run fence that gets interpreted
MlldRunFence
  = "```" "mlld-run" "\n"
    content:(!("```" ("\n" / !.)) c:. { return c; })*
    "```" ("\n" / !.) {
      // Parse the content as mlld directives
      const rawContent = content.join('');
      helpers.debug('MlldRunFence: Parsing content', { content: rawContent });
      
      try {
        // Parse the inner content as mlld
        const innerParser = peg$parse;
        const parsed = innerParser(rawContent, {
          ...options,
          startRule: 'Start'
        });
        
        // Return a special node that contains the parsed directives
        return helpers.createNode(NodeType.MlldRunBlock, {
          content: parsed,
          raw: rawContent,
          location: location()
        });
      } catch (e) {
        // If parsing fails, return an error node
        return helpers.createNode(NodeType.MlldRunBlock, {
          content: [],
          raw: rawContent,
          error: e.message,
          location: location()
        });
      }
    }
  / opener:"```" &{
      // Check if someone is trying to use more than 3 backticks for mlld-run
      const rest = input.substring(peg$currPos);
      return rest.startsWith('`') && rest.match(/^`+mlld-run/);
    } {
      error('mlld-run blocks must use exactly 3 backticks (```). Nested backticks are not supported.');
    }

CodeFence
  = opener:BacktickSequence lang:CodeFenceLangID? "\n"
    content:(!(&{ return true; } closer:BacktickSequence &{
      return closer.length === opener.length;
    }) c:. { return c; })*
    closer:BacktickSequence !{
      return closer.length !== opener.length;
    } ("\n" / !.) {
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
// - AtVarDirective from directives/var.peggy (/var) - NEW: replaces text/data
// - AtShow from directives/show.peggy (/show) - NEW: replaces add
// - AtExe from directives/exe.peggy (/exe) - NEW: replaces exec
// - AtRun from directives/run.peggy (/run)
// - AtImport from directives/import.peggy (/import)
// - AtPath from directives/path.peggy (/path)
// - AtOutput from directives/output.peggy (/output)
// - AtWhen from directives/when.peggy (/when)