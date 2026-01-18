// mlld.pegjs
// Mlld grammar implementation - Refactored Version

{
  // NodeType, DirectiveKind, and helpers are injected via parser-dependencies
  
  // Initialize options for context tracking
  if (typeof options !== 'undefined') {
    options.rhsDirectiveType = '';
    options.afterDirectiveType = '';
  }
  
  // Helper functions for unified expressions
  function isSimpleCondition(expr) {
    return expr.type === 'VariableReference' || 
           expr.type === 'Literal' ||
           (expr.type === 'UnaryExpression' && expr.operator === '!' && 
            isSimpleCondition(expr.operand));
  }

  function isComparisonOperator(op) {
    return ['==', '!=', '~=', '<', '>', '<=', '>='].includes(op);
  }

  function extractConditionVariables(expr) {
    const variables = [];
    function traverse(node) {
      if (!node) return;
      
      if (node.type === 'VariableReference') {
        variables.push(node.name);
      } else if (node.type === 'ExecutableReference') {
        variables.push(node.name);
      }
      
      // Traverse binary expressions
      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
      
      // Traverse unary expressions
      if (node.operand) traverse(node.operand);
      if (node.argument) traverse(node.argument);
      
      // Traverse ternary expressions
      if (node.condition) traverse(node.condition);
      if (node.trueBranch) traverse(node.trueBranch);
      if (node.falseBranch) traverse(node.falseBranch);
    }
    
    traverse(expr);
    return [...new Set(variables)];
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
    / StrictBlankLine            /* <— Ignore blank lines in strict mode */
    / StrictModeTextError        /* <— Surface errors for prose in strict mode */
    / TextBlock                  /* <— Finally, plain text */
    )* {
    helpers.debug('Start: Entered');
    const result = [];
    if (frontmatter) result.push(frontmatter);
    for (const node of nodes) {
      if (node !== null && node !== undefined) {
        result.push(node);
      }
    }
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
      const isStrictMode = options?.mode === 'strict';
      const isDirectiveLine = i < input.length && helpers.isDirectiveContext(input, i);
      const hasSlash = i < input.length && input[i] === '/';
      return isDirectiveLine && (isStrictMode || hasSlash);
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
    } marker:CommentMarker HWS content:CommentContent {
    return helpers.createNode(NodeType.Comment, { 
      content: content.trim(), 
      marker: marker,
      location: location() 
    });
  }

Comment
  = marker:CommentMarker HWS content:CommentContent {
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
  = _ marker:CommentMarker HWS content:CommentContent {
    return {
      type: 'Comment',
      marker: marker,
      content: content.trim(),
      location: location()
    };
  }

// Block-level comments - consumed and ignored inside blocks
BlockComments
  = Comment { return null; }
  / InlineComment { return null; }

// Leading block comment - captures the comment for attachment to first statement
LeadingBlockComment
  = comment:Comment { return comment; }

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
      if (isAtLineStart && helpers.isDirectiveContext(input, pos)) {
        const hasSlash = input[pos] === '/';
        const isStrictMode = options?.mode === 'strict';
        if (isStrictMode || hasSlash) {
          return true; // Stop parsing text - directive ahead
        }
      }
      
      // Check for comment start
      if (isAtLineStart && input[pos] === '>' && input[pos + 1] === '>') {
        return true; // Stop parsing text - it's a comment
      }
      
      return false; // Continue parsing text
    } !(
       "::"           /* block multiline-template opening */
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
  = &{ 
      const pos = offset();
      if (!helpers.isLogicalLineStart(input, pos)) return false;
      if (!helpers.isDirectiveContext(input, pos)) return false;
      const hasSlash = input[pos] === '/';
      const isStrictMode = options?.mode === 'strict';
      return isStrictMode || hasSlash;
    }
    [ \t]*                        // allow leading tabs/spaces
    dir:(
      SlashVar      // NEW: Var directives (unified variable assignment)
    / SlashShow     // NEW: Show directives (content display) - replaces AtAdd
    / SlashLog      // NEW: Log directives (syntactic sugar for /output to stdout)
    / SlashExe      // NEW: Exe directives (define commands/code) - replaces AtExec
    / SlashFor      // For directives (iteration)
    / SlashWhile    // While directives (bounded iteration)
    / SlashLoop     // Loop directives (block iteration)
    / SlashRun      // Run directives (commands, code)
    / SlashPath     // Path directives (path variables)
    / SlashImport   // Import directives (from other files)
    / SlashExport   // Export directives (explicit exports)
    / SlashOutput   // Output directives (output routing)
    / SlashAppend   // Append directives (incremental file writing)
    / SlashWhen     // When directives (conditional execution)
    / SlashGuard    // Guard directives (security policies)
    / SlashPolicy   // Policy composition directives
    / SlashNeeds    // Needs directives (capability declarations)
    / SlashProfiles // Profiles directives (capability tiers)
    / SlashStream   // Stream directives
    // NO AtText, AtData, AtAdd, AtExec - deleted!
    ) { return dir; }

// -------------------------------------------------------------------------
// STRICT MODE LINE HANDLING
// -------------------------------------------------------------------------

StrictBlankLine
  = &{ return options?.mode === 'strict'; }
    [ \t\r]* LineTerminator { return null; }
  / &{ return options?.mode === 'strict'; }
    [ \t\r]+ &EOF { return null; }

StrictModeTextError
  = &{ return options?.mode === 'strict'; }
    &{ return !helpers.isDirectiveContext(input, offset()); }
    (!LineTerminator .)+ LineTerminator? {
      error("Text content not allowed in strict mode (.mld). Use .mld.md for prose.");
    }

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
        // Parse in strict mode: slashes optional, no prose allowed between directives
        const innerParser = peg$parse;
        const parsed = innerParser(rawContent, {
          ...options,
          mode: 'strict',
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
      helpers.mlldError('mlld-run blocks must use exactly 3 backticks (```). Nested backticks are not supported.');
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
