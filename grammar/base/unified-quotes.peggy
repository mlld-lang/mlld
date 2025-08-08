// UNIFIED QUOTE PATTERNS
// Single source of truth for all quote handling in mlld grammar
// Copied from content.peggy and refined to be the canonical quote abstraction

/* 
# Purpose

This file provides the SINGLE unified abstraction for all quote handling:
- Double quotes with @var interpolation
- Single quotes (literal only)
- Backticks with @var and @func() interpolation

All other quote patterns in the grammar should use these base patterns
and adapt them to their specific context needs.
*/

// -------------------------------------------------------------
// UNIFIED QUOTE PATTERN - The single source of truth
// -------------------------------------------------------------

UnifiedQuote "Unified quote pattern"
  = UnifiedDoubleQuote
  / UnifiedSingleQuote
  / UnifiedBacktick

// Double quotes with @var interpolation
UnifiedDoubleQuote "Double quoted string with interpolation"
  = '"' parts:(SpecialVariable / FileReferenceInterpolation / TemplateVariableReference / UnifiedDoubleQuotedText)* '"' {
      helpers.debug('UnifiedQuote: DoubleQuote matched', { parts });
      // Handle empty string case - create Text node with empty content
      const content = parts.length === 0 
        ? [helpers.createNode(NodeType.Text, { content: '', location: location() })]
        : parts;
      return {
        content: content,
        wrapperType: 'doubleQuote',
        hasInterpolation: true
      };
    }

// Single quotes - literal only, no interpolation
UnifiedSingleQuote "Single quoted literal string"
  = "'" content:EscapedSingleStringContent "'" { 
      helpers.debug('UnifiedQuote: SingleQuote matched', { content });
      return {
        content: [helpers.createNode(NodeType.Text, { content, location: location() })],
        wrapperType: 'singleQuote',
        hasInterpolation: false
      };
    }

// Backticks with @var and @func() interpolation
UnifiedBacktick "Backtick string with interpolation"
  = '`' content:UnifiedBacktickInterpolation* '`' {
      helpers.debug('UnifiedQuote: Backtick matched', { content });
      return {
        content: content,
        wrapperType: 'backtick',
        hasInterpolation: true
      };
    }

// -------------------------------------------------------------
// INTERPOLATION CONTENT PATTERNS
// -------------------------------------------------------------

// Content inside backtick templates - supports @var and @func(args) and <file.md>
UnifiedBacktickInterpolation "Backtick interpolation content"
  = UnifiedBacktickExecInvocation    // @func(args) - must come before variable
  / FileReferenceInterpolation // <file.md> references with fields/pipes
  / TemplateVariableReference // @var - NO tail modifier constraints
  / "@" !BaseIdentifier char:. {     // @ followed by non-identifier (like @:)
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  / UnifiedBacktickTextSegment       // Plain text

// -------------------------------------------------------------
// SUPPORTING PATTERNS (from content.peggy)
// -------------------------------------------------------------

// Function call in backtick template
UnifiedBacktickExecInvocation
  = "@" name:BaseIdentifier &"(" args:CommandArgs {
      helpers.debug('UnifiedBacktickExecInvocation matched', { name, args });
      
      // Create an exec invocation node
      const commandRef = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      return helpers.createExecInvocation(commandRef, null, location());
    }

// Text inside backticks (excluding @ and < for interpolation)
UnifiedBacktickTextSegment
  = chars:UnifiedBacktickChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

UnifiedBacktickChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / ![`@<] char:. { return char; }

// Text inside double quotes (supports newlines)
UnifiedDoubleQuotedText
  = chars:UnifiedDoubleQuotedChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

// Character inside double quotes
UnifiedDoubleQuotedChar
  = StringEscapeSequence  // Handle \n, \t, etc.
  / EscapeSequence       // Handle \@, \", etc.
  / !["@<\n\r] char:. { return char; }  // Exclude < to trigger FileReferenceInterpolation

// -------------------------------------------------------------
// DEPENDENCIES (defined elsewhere but referenced here)
// -------------------------------------------------------------
// These patterns are defined in other files and imported:
// - SpecialVariable (from variables.peggy)
// - FileReferenceInterpolation (from file-reference.peggy)
// - TemplateVariableReference (from variables.peggy)
// - EscapedSingleStringContent (from segments.peggy)
// - CommandArgs (from command-reference.peggy)
// - BaseIdentifier (from tokens.peggy)
// - StringEscapeSequence (from segments.peggy)
// - EscapeSequence (from segments.peggy)