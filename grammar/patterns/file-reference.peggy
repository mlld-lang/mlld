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
  = "<" _ content:FileReferenceContent _ ">" fields:FileFieldChain? pipes:CondensedPipeChain? {
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
  / "<" _ ">" fields:FileFieldChain? pipes:CondensedPipeChain? {
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

// Condensed pipe syntax (no whitespace allowed)
CondensedPipe "condensed pipe"
  = "|" "@" name:BaseIdentifier args:CondensedPipeArgs? {
      return { 
        name: name,
        args: args || [],
        location: location()
      };
    }

// Optional arguments for pipes
CondensedPipeArgs
  = "(" _ args:PipeArgList _ ")" { return args; }

// Pipe argument list
PipeArgList
  = first:PipeArg rest:(_ "," _ arg:PipeArg { return arg; })* {
      return [first, ...rest];
    }

// Individual pipe argument - can be various types
PipeArg
  = StringLiteral
  / NumberLiteral  
  / "@" varName:BaseIdentifier { return { type: 'variable', name: varName }; }

// Chain of condensed pipes
CondensedPipeChain "pipe chain"
  = pipes:CondensedPipe+ {
      return pipes;
    }

// Field access chain for file references
FileFieldChain "field chain"
  = fields:AnyFieldAccess+ {
      return fields;
    }