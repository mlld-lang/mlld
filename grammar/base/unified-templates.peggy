// UNIFIED TEMPLATE PATTERNS
// Single source of truth for all template handling in mlld grammar
// Extracted from content.peggy to be the canonical template abstraction

/* 
# Purpose

This file provides the SINGLE unified abstraction for all template handling:
- Double colons (::content::) with @var interpolation
- Triple colons (:::content:::) with {{var}} interpolation  
- Double brackets ([[content]]) with {{var}} interpolation

All template patterns in the grammar should use these base patterns
and adapt them to their specific context needs.
*/

// -------------------------------------------------------------
// UNIFIED TEMPLATE PATTERN - The single source of truth
// -------------------------------------------------------------

UnifiedTemplate "Unified template pattern"
  = UnifiedTripleColon
  / UnifiedDoubleColon
  / UnifiedDoubleBracket

// Triple colons with {{var}} interpolation
UnifiedTripleColon "Triple colon template"
  = ':::' parts:TemplateBodyMtt ':::' {
      helpers.debug('UnifiedTripleColon matched :::...:::', { parts });
      
      // Strip formatting newlines (same as current implementation)
      let processedParts = parts;
      
      // Remove leading newline if first part is a Text node starting with \n
      if (processedParts.length > 0 && processedParts[0].type === 'Text' && processedParts[0].content) {
        if (processedParts[0].content === '\n') {
          processedParts = processedParts.slice(1);
        } else if (processedParts[0].content.startsWith('\n')) {
          processedParts[0] = {
            ...processedParts[0],
            content: processedParts[0].content.slice(1)
          };
        }
      }
      
      // Remove trailing newline if last part is a Text node ending with \n
      if (processedParts.length > 0) {
        const lastIndex = processedParts.length - 1;
        const lastPart = processedParts[lastIndex];
        if (lastPart.type === 'Text' && lastPart.content) {
          if (lastPart.content === '\n') {
            processedParts = processedParts.slice(0, -1);
          } else if (lastPart.content.endsWith('\n')) {
            processedParts[lastIndex] = {
              ...lastPart,
              content: lastPart.content.slice(0, -1)
            };
          }
        }
      }
      
      return {
        content: processedParts,
        wrapperType: 'tripleColon',
        interpolationType: 'doubleBrace'  // {{var}} style
      };
    }

// Double colons with @var interpolation
UnifiedDoubleColon "Double colon template"
  = '::' !":" parts:(
      TemplateSlashForBlockDouble
      / TemplateInlineShow
      / UnifiedAtInterpolation
    )* '::' {
      helpers.debug('UnifiedDoubleColon matched ::...::', { parts });
      
      // Strip formatting newlines (same as triple colon)
      let processedParts = parts;
      
      // Remove leading newline if first part is a Text node starting with \n
      if (processedParts.length > 0 && processedParts[0].type === 'Text' && processedParts[0].content) {
        if (processedParts[0].content === '\n') {
          processedParts = processedParts.slice(1);
        } else if (processedParts[0].content.startsWith('\n')) {
          processedParts[0] = {
            ...processedParts[0],
            content: processedParts[0].content.slice(1)
          };
        }
      }
      
      // Remove trailing newline if last part is a Text node ending with \n
      if (processedParts.length > 0) {
        const lastIndex = processedParts.length - 1;
        const lastPart = processedParts[lastIndex];
        if (lastPart.type === 'Text' && lastPart.content) {
          if (lastPart.content === '\n') {
            processedParts = processedParts.slice(0, -1);
          } else if (lastPart.content.endsWith('\n')) {
            processedParts[lastIndex] = {
              ...lastPart,
              content: lastPart.content.slice(0, -1)
            };
          }
        }
      }
      
      return {
        content: processedParts,
        wrapperType: 'doubleColon',
        interpolationType: 'atSign'  // @var style
      };
    }

// Double brackets with {{var}} interpolation
UnifiedDoubleBracket "Double bracket template"
  = '[[' parts:(
      TemplateInlineShow
      / UnifiedBraceInterpolation
      / FileReferenceInterpolation
      / UnifiedBracketTextSegment
    )* ']]' {
      helpers.debug('UnifiedDoubleBracket matched [[...]]', { parts });
      
      return {
        content: parts,
        wrapperType: 'doubleBracket',
        interpolationType: 'doubleBrace'  // {{var}} style
      };
    }

// -------------------------------------------------------------
// INTERPOLATION PATTERNS
// -------------------------------------------------------------

// {{var}} style interpolation
UnifiedBraceInterpolation "Brace interpolation"
  = InterpolationVar  // Reuse existing pattern from content.peggy

// @var style interpolation for double colons
UnifiedAtInterpolation "At-sign interpolation"
  = ConditionalTemplateSnippet   // @var?`...`
  / NullCoalescingTight          // @var??"default"
  / ConditionalVariableOmission  // @var?
  / ExecResultMethodCall         // @func(args).method(args)
  / FieldAccessExec              // @obj.method(args)
  / UnifiedExecInvocation        // @func(args)
  / UnifiedAngleBracketContent   // <file.md> or literal <xml> - USE UNIFIED PATTERN
  / TemplateVariableReference    // @var (with template pipes and fields)
  / UnifiedReferenceNoTail       // Fallback for @var.field without pipes
  / "@@" {                       // @@ -> literal @ (mlld-75e)
      return helpers.createNode(NodeType.Text, { content: '@', location: location() });
    }
  / "\\@" {                      // \@ -> literal @
      return helpers.createNode(NodeType.Text, { content: '@', location: location() });
    }
  / "@" !BaseIdentifier char:. { // @ followed by non-identifier (like @:)
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  / UnifiedDoubleColonTextSegment  // Plain text

// -------------------------------------------------------------
// TEXT SEGMENTS
// -------------------------------------------------------------

// Line-start predicate for inline loop detection
// Used to ensure /for and /end only trigger at line start
LineStartPredicate "line-start check"
  = &{
      const pos = offset();
      if (pos === 0) return true;
      const prev = input[pos - 1];
      return prev === '\n' || prev === '\r';
    }

// Text for triple colon templates (excludes :::, {{, }})
UnifiedTemplateTextSegment "Template text segment"
  = chars:UnifiedTemplateChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

UnifiedTemplateChar
  = StringEscapeSequence
  / EscapeSequence
  / !((":::" / "{{" / "}}")) char:. { return char; }

// Text for double colon templates (excludes ::, @, \@, and < only when it's a valid file ref or literal tag)
// Only excludes /for and /end when they appear at line start
UnifiedDoubleColonTextSegment "Double colon text segment"
  = chars:(!("::" / (LineStartPredicate "/for") / (LineStartPredicate "/end") / "\\@" / "@" / &"<" FileReferenceInterpolation / &"<" AngleBracketLiteral) char:. { return char; })+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

// Text for double bracket templates (excludes ]], {{, }}, and <)
UnifiedBracketTextSegment "Bracket text segment"
  = chars:UnifiedBracketChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

UnifiedBracketChar
  = StringEscapeSequence
  / EscapeSequence
  / !("]]" / "{{" / "}}" / "<") char:. { return char; }

// -------------------------------------------------------------
// TEMPLATE BLOCKS AND INLINE SHOW (template context only)
// -------------------------------------------------------------

// Slash-style for block inside double-colon templates
TemplateSlashForBlockDouble "slash for-block (double-colon)"
  = &{
      const pos = offset();
      if (pos === 0) return true;
      const prev = input[pos - 1];
      return prev === '\n' || prev === '\r';
    }
    "/for" _ pattern:ForIterationPattern _ parts:(
      TemplateSlashForBlockDouble
      / TemplateInlineShow
      / UnifiedAtInterpolation
      / FileReferenceInterpolation
      / UnifiedDoubleColonTextSegment
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

// No for-blocks in triple-colon (::: … :::) or double-bracket ([[ … ]]) templates

// Inline /show inside template contexts
TemplateInlineShow "inline show (template)"
  = "/show" _ content:UnifiedCommandBrackets tail:TailModifiers? {
      return {
        type: 'TemplateInlineShow',
        showKind: 'command',
        content,
        tail: tail || null
      };
    }
  / "/show" _ lang:RunCodeLanguage _ code:UnifiedCodeBrackets tail:TailModifiers? {
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: code.content, location: location() });
      return {
        type: 'TemplateInlineShow',
        showKind: 'code',
        lang: [langNode],
        code: [codeNode],
        meta: { isMultiLine: code.isMultiLine, language: lang },
        tail: tail || null
      };
    }
  / "/show" _ template:TemplateCore tail:TailModifiers? {
      return {
        type: 'TemplateInlineShow',
        showKind: 'template',
        template,
        tail: tail || null
      };
    }
  / "/show" _ loader:AlligatorExpression tail:TailModifiers? {
      return {
        type: 'TemplateInlineShow',
        showKind: 'load',
        loadContent: loader,
        tail: tail || null
      };
    }
  / "/show" _ ref:UnifiedReferenceWithTail {
      return {
        type: 'TemplateInlineShow',
        showKind: 'reference',
        reference: ref
      };
    }

// -------------------------------------------------------------
// TEMPLATE BODY START RULES (for .att/.mtt files)
// -------------------------------------------------------------

// ATT-style templates (@var interpolation, slash blocks, inline show)
// Uses UnifiedAttTextSegment which allows :: as literal text (unlike double-colon templates)
TemplateBodyAtt "template body for .att files"
  = parts:(
      TemplateSlashForBlockDouble
      / TemplateInlineShow
      / UnifiedAtInterpolation
      / FileReferenceInterpolation
      / UnifiedAttTextSegment
    )* { return parts; }

// Text for standalone .att files - allows :: as literal text
// Only excludes @, \@, < (for file refs), and /for, /end at line start
UnifiedAttTextSegment "ATT text segment"
  = chars:(!((LineStartPredicate "/for") / (LineStartPredicate "/end") / "\\@" / "@" / &"<" FileReferenceInterpolation / &"<" AngleBracketLiteral) char:. { return char; })+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

// MTT-style templates ({{var}} interpolation, inline show)
TemplateBodyMtt "template body for .mtt files"
  = parts:(
      TemplateInlineShow
      / UnifiedBraceInterpolation
      / UnifiedTemplateTextSegment
    )* { return parts; }

// -------------------------------------------------------------
// DEPENDENCIES (defined elsewhere but referenced here)
// -------------------------------------------------------------
// These patterns are defined in other files and imported:
// - InterpolationVar (from content.peggy)
// - BacktickExecInvocation (from content.peggy or unified-quotes.peggy)
// - FileReferenceInterpolation (from file-reference.peggy)
// - TemplateVariableReference (from variables.peggy)
// - BaseIdentifier (from tokens.peggy)
// - StringEscapeSequence (from segments.peggy)
// - EscapeSequence (from segments.peggy)
