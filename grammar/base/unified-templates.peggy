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
  = ':::' parts:(UnifiedBraceInterpolation / FileReferenceInterpolation / UnifiedTemplateTextSegment)* ':::' {
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
  = '::' parts:(UnifiedAtInterpolation)* '::' {
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
  = '[[' parts:(UnifiedBraceInterpolation / FileReferenceInterpolation / UnifiedBracketTextSegment)* ']]' {
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
  = UnifiedExecInvocation      // @func(args)
  / FileReferenceInterpolation   // <file.md>
  / TemplateVariableReference   // @var - NO tail modifier constraints
  / "@" !BaseIdentifier char:. { // @ followed by non-identifier
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  / UnifiedDoubleColonTextSegment  // Plain text

// -------------------------------------------------------------
// TEXT SEGMENTS
// -------------------------------------------------------------

// Text for triple colon templates (excludes :::, {{, }}, and <)
UnifiedTemplateTextSegment "Template text segment"
  = chars:UnifiedTemplateChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

UnifiedTemplateChar
  = StringEscapeSequence
  / EscapeSequence
  / !((":::" / "{{" / "}}" / "<")) char:. { return char; }

// Text for double colon templates (excludes ::, @, and <)
UnifiedDoubleColonTextSegment "Double colon text segment"
  = chars:(!("::" / "@" / "<") char:. { return char; })+ {
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