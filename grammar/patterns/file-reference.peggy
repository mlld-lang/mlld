// FILE REFERENCE INTERPOLATION PATTERNS
// Purpose: Enable <file.md> syntax in interpolation contexts with field access and piping
// Used by: BacktickInterpolation, DoubleQuotedText, TemplateTextSegment, CommandContent

/*
# File Reference Interpolation

Enables file references within interpolation contexts:
- `text with <file.md>` - loads file content
- `<data.json>.field` - accesses fields
- `<file.txt>|@upper` - applies transformations
- `<>` - placeholder for current file in 'as' contexts

## Detection Rule
`<...>` is a file reference if content contains: . * @
Otherwise it's literal text (e.g., <div>, </xml>)
Files without extensions can still be used outside interpolation contexts
*/

// Main file reference pattern for interpolation contexts
FileReferenceInterpolation "file reference interpolation"
  = "<" &{
      // Semantic lookahead: validate BEFORE attempting to parse content
      // Extract content between < and > without consuming it
      const rest = input.substring(peg$currPos);
      const closingIndex = rest.indexOf('>');
      if (closingIndex === -1) return false; // No closing >
      
      const content = rest.substring(0, closingIndex).trim();
      // Exclude HTML comments like <!-- ... -->
      if (content.startsWith('!')) return false;
      // Use same validation as helpers.isFileReferenceContent: must contain . * or @
      return /[.*@]/.test(content);
    } _ content:FileReferenceContent _ ">" fields:FileFieldChain? pipes:TemplatePipeChain? {
      // Extract the raw string from the content
      let contentStr;
      if (content.raw) {
        // AlligatorUnquotedPath returns {type: 'path', raw: string, ...}
        contentStr = content.raw;
      } else if (content.type === NodeType.Text) {
        // AlligatorQuotedPath returns a Text node
        contentStr = content.content;
      } else if (Array.isArray(content)) {
        // Fallback for array of nodes
        contentStr = helpers.reconstructRawString(content);
      } else {
        contentStr = String(content);
      }
      
      // Check if this is actually a file reference
      if (!helpers.isFileReferenceContent(contentStr)) {
        // Not a file reference - return as literal text
        return helpers.createNode(NodeType.Text, {
          content: `<${contentStr}>`,
          location: location()
        });
      }
      
      // Create file reference node
      return helpers.createFileReferenceNode(content, fields, pipes, location());
    }
  / "<" _ ">" fields:FileFieldChain? pipes:TemplatePipeChain? {
      // Special <> placeholder for 'as' contexts
      return helpers.createFileReferenceNode(
        { type: 'placeholder', raw: '' },
        fields,
        pipes,
        location()
      );
    }

// File reference content - reuse alligator path parsing
FileReferenceContent "file reference content"
  = AlligatorUnquotedPath   // Reuse from alligator.peggy
  / AlligatorQuotedPath     // Handles "paths with spaces"

// Template pipes (no arguments) for interpolation contexts
TemplatePipe "template pipe (no args)"
  = pipeStart:("" { return peg$currPos; }) "|" "@" name:BaseIdentifier {
      const loc = location();
      const startOffset = pipeStart;
      return {
        type: 'CondensedPipe',
        transform: name,
        hasAt: true,
        args: [],
        location: {
          source: loc.source,
          start: {
            offset: startOffset,
            line: loc.start.line,
            column: loc.start.column - (loc.start.offset - startOffset)
          },
          end: loc.end
        }
      };
    }

// Spaced or condensed pipe (interpolation contexts allow condensed only; var RHS may add spaced variant)
SpacedOrCondensedFilePipe
  = HWS pipeStart:("" { return peg$currPos; }) "|" HWS "@" name:BaseIdentifier {
      const loc = location();
      const startOffset = pipeStart;
      return { 
        type: 'CondensedPipe',
        transform: name,
        hasAt: true,
        args: [],
        location: {
          source: loc.source,
          start: { 
            offset: startOffset,
            line: loc.start.line,
            column: loc.start.column - (loc.start.offset - startOffset)
          },
          end: loc.end
        }
      };
    }

// Chain of template pipes (no args) inside interpolation contexts
TemplatePipeChain "template pipe chain"
  = pipes:TemplatePipe+ { return pipes; }

// Field access chain for file references
FileFieldChain "field chain"
  = fields:AnyFieldAccess+ {
      return fields;
    }