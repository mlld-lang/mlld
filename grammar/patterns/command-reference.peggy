// Pattern: command-reference.peggy
// Purpose: Shared command reference pattern for exec/run directives
// Used by: exec.peggy, add.peggy (for execReference)
// Note: This file assumes helpers and NodeType are available from peg$imports

// Shared command reference pattern
// Matches: commandName(arg1, arg2, @var)
CommandReference "command reference"
  = name:BaseIdentifier _ args:CommandArgs? {
      helpers.debug('CommandReference matched', { name, args });
      return {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
    }

// Arguments for command references
CommandArgs "command arguments"
  = "(" _ args:CommandArgumentList? _ ")" {
      return args || [];
    }

CommandArgumentList "command arguments list"
  = first:CommandArgument rest:(_ "," _ arg:CommandArgument { return arg; })* {
      // Filter out null arguments (from empty raw arguments)
      const args = [first, ...rest].filter(arg => arg !== null);
      return args;
    }

CommandArgument "command argument"
  = CommandTemplateArgument     // Template arguments ::...::
  / BacktickTemplateArgument    // Backtick templates `...`
  / NestedExecInvocation       // Nested function calls @func(args)
  / DataObjectLiteral           // Object literals: {"key": "value"}
  / ArrayLiteral                // Arrays: [1, 2, 3]
  / AlligatorExpression         // File loading: <file.md>
  / str:DataString {
      // Create a Text node directly
      // Handle both simple strings and interpolated content
      if (typeof str === 'string') {
        return helpers.createNode(NodeType.Text, {
          content: str,
          location: location()
        });
      } else if (str.needsInterpolation) {
        // Return the parts for runtime interpolation
        return str.parts;
      }
    }
  / varRef:VariableNoTail {  // Use unified variable pattern for command context
      // Return the VariableReference directly
      return varRef;
    }
  / PrimitiveValue       // Direct primitives: 42, true, false, null
  / EscapedArgument      // Escaped characters in unquoted arguments
  / RawArgument          // Fallback for unquoted arguments


// Nested function call in command arguments
NestedExecInvocation "nested exec invocation"
  = "@" name:BaseIdentifier args:CommandArgs {
      helpers.debug('NestedExecInvocation matched', { name, args });
      
      // Create a command reference
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      return helpers.createNode(NodeType.ExecInvocation, {
        commandRef: ref,
        withClause: null,
        location: location()
      });
    }

// Template argument - ::template content::
CommandTemplateArgument "command template argument"
  = "::" content:CommandTemplateContent* "::" {
      return helpers.createNode(NodeType.Text, {
        content: content.map(c => c.content || c.identifier || '').join(''),
        isTemplate: true,
        templateParts: content,
        location: location()
      });
    }

// Backtick template argument - `template with @var`
BacktickTemplateArgument "backtick template argument"
  = template:BacktickTemplate {
      helpers.debug('BacktickTemplateArgument matched', { template });
      
      // Return the template wrapped in the expected structure
      return template;
    }

// Backtick template pattern
BacktickTemplate "backtick template"
  = "`" parts:(UnifiedBacktickInterpolation)* "`" {
      // Return as a template structure that preserves interpolation
      return {
        content: parts,
        wrapperType: 'backtick'
      };
    }

// Content inside template arguments - allows {{var}} interpolation
CommandTemplateContent
  = InterpolationVar    // {{var}} syntax
  / chars:CommandTemplateChar+ {
      return helpers.createNode(NodeType.Text, {
        content: chars.join(''),
        location: location()
      });
    }

CommandTemplateChar
  = !("}}" / "::") char:. { return char; }

// Escaped argument - supports backslash escaping
EscapedArgument "escaped argument"
  = chars:EscapedArgChar+ {
      const content = chars.join('');
      // Create a Text node (variables are handled by AtVar rule)
      return helpers.createNode(NodeType.Text, {
        content: content,
        location: location()
      });
    }

EscapedArgChar
  = "\\" char:. { return char; }  // Escaped character
  / !(["'`,)] / "," / _ "," _ / _ ")") char:. { return char; }  // Regular character

// Raw unquoted argument - basic fallback
RawArgument "raw argument"
  = chars:RawArgChar+ {
      const content = chars.join('').trim();
      if (!content) return null; // Skip empty arguments
      
      // Create a Text node (variables are handled by AtVar rule)
      return helpers.createNode(NodeType.Text, {
        content: content,
        location: location()
      });
    }

RawArgChar
  = !(["'`] / "," / ")" / "\\") char:. { return char; }