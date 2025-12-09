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

// Double quotes with @var and @func() interpolation
UnifiedDoubleQuote "Double quoted string with interpolation"
  = '"' parts:(SpecialVariable / UnifiedInterpolationContent / UnifiedAtLiteral / UnifiedDoubleQuotedText)* '"' {
      helpers.debug('UnifiedQuote: DoubleQuote matched', { parts });
      
      // If it's a plain string (no interpolation), create a Literal node for directive contexts
      if (parts.length === 1 && parts[0].type === 'Text') {
        // Single text segment - this is a plain string literal
        const content = [helpers.createNode('Literal', { 
          value: parts[0].content, 
          valueType: 'string',
          location: location() 
        })];
        return {
          content: content,
          wrapperType: 'doubleQuote',
          hasInterpolation: false
        };
      }
      
      // Handle empty string case - create Literal node with empty content
      const content = parts.length === 0 
        ? [helpers.createNode('Literal', { value: '', valueType: 'string', location: location() })]
        : parts;
      return {
        content: content,
        wrapperType: 'doubleQuote',
        hasInterpolation: parts.length > 1 || (parts.length === 1 && parts[0].type !== 'Text')
      };
    }

// Single quotes - literal only, no interpolation
UnifiedSingleQuote "Single quoted literal string"
  = "'" content:EscapedSingleStringContent "'" { 
      helpers.debug('UnifiedQuote: SingleQuote matched', { content });
      return {
        content: [helpers.createNode('Literal', { 
          value: content, 
          valueType: 'string',
          location: location() 
        })],
        wrapperType: 'singleQuote',
        hasInterpolation: false
      };
    }

// Backticks with @var and @func() interpolation
UnifiedBacktick "Backtick string with interpolation"
  = '`' content:UnifiedBacktickInterpolation* '`' {
      helpers.debug('UnifiedQuote: Backtick matched', { content });
      
      // If it's a plain string (single Text node), create a Literal for directive contexts
      if (content.length === 1 && content[0].type === 'Text') {
        return {
          content: [helpers.createNode('Literal', { 
            value: content[0].content, 
            valueType: 'string',
            location: location() 
          })],
          wrapperType: 'backtick',
          hasInterpolation: false
        };
      }
      
      // Empty backticks should also be a Literal
      if (content.length === 0) {
        return {
          content: [helpers.createNode('Literal', { 
            value: '', 
            valueType: 'string',
            location: location() 
          })],
          wrapperType: 'backtick',
          hasInterpolation: false
        };
      }
      
      return {
        content: content,
        wrapperType: 'backtick',
        hasInterpolation: true
      };
    }

// -------------------------------------------------------------
// INTERPOLATION CONTENT PATTERNS
// -------------------------------------------------------------

// Shared interpolation pattern for both double quotes and backticks
// Supports @var, @func(args), and <file.md>
UnifiedInterpolationContent "Shared interpolation content"
  = ExecResultMethodCall         // @func(args).method(args)
  / FieldAccessExec              // @obj.method(args)
  / UnifiedExecInvocation        // @func(args)
  / FileReferenceInterpolation   // <file.md> references with fields/pipes
  / TemplateVariableReference    // @var (with template pipes and fields)
  / UnifiedReferenceNoTail       // Fallback for @var.field without pipes

// Content inside backtick templates - supports @var and @func(args) and <file.md>
UnifiedBacktickInterpolation "Backtick interpolation content"
  = TemplateSlashForBlockBacktick    // Inline for-block
  / TemplateInlineShow               // Inline /show
  / UnifiedInterpolationContent      // Use shared interpolation
  / "@" !BaseIdentifier char:. {     // @ followed by non-identifier (like @:)
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  / AngleBracketLiteral              // USE ABSTRACTED PATTERN instead of inline rule
  / UnifiedBacktickTextSegment       // Plain text

// -------------------------------------------------------------
// SUPPORTING PATTERNS (from content.peggy)
// -------------------------------------------------------------

// Function call in interpolation contexts (shared by backticks and double quotes)
UnifiedExecInvocation
  = "@" name:BaseIdentifier &"(" argList:UnifiedArgumentList {
      helpers.debug('UnifiedExecInvocation matched', { name, argList });
      
      // Extract arguments from unified argument list
      const args = argList.arguments || [];
      
      // Create an exec invocation node
      const commandRef = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args,
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
  / !("`" / "@" / (LineStartPredicate "/for") / (LineStartPredicate "/end") / &"<" FileReferenceInterpolation / &"<" AngleBracketLiteral) char:. { return char; }

// Literal @ when not followed by an identifier (e.g., "@" at end of string or "@:")
UnifiedAtLiteral "literal @ character"
  = "@" !BaseIdentifier {
      return helpers.createNode(NodeType.Text, { content: '@', location: location() });
    }

// Text inside double quotes (supports newlines)
UnifiedDoubleQuotedText
  = chars:UnifiedDoubleQuotedChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

// Character inside double quotes
UnifiedDoubleQuotedChar
  = StringEscapeSequence  // Handle \n, \t, etc.
  / EscapeSequence       // Handle \@, \", etc.
  / !["@\n\r] char:. { return char; }  // Allow < characters, rely on semantic lookahead

// Backtick slash-style for block
TemplateSlashForBlockBacktick "slash for-block (backtick)"
  = &{
      const pos = offset();
      if (pos === 0) return true;
      const prev = input[pos - 1];
      return prev === '\n' || prev === '\r';
    }
    "/for" _ pattern:ForIterationPattern _ parts:(
      TemplateSlashForBlockBacktick
      / TemplateInlineShow
      / UnifiedInterpolationContent
      / UnifiedBacktickTextSegment
    )* _ &{
      const pos = offset();
      if (pos === 0) return true;
      const prev = input[pos - 1];
      return prev === '\n' || prev === '\r';
    } "/end" {
      return {
        type: 'TemplateForBlock',
        variable: pattern.variable,
        source: pattern.source,
        body: parts,
        style: 'slash'
      };
    }

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
