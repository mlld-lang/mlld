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
  / str:StringLiteral {
      // Create a Text node directly
      return helpers.createNode(NodeType.Text, {
        content: str,
        location: location()
      });
    }
  / varRef:Variable {
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
  = "`" parts:(BacktickInterpolation)* "`" {
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
      // If it starts with @, create a VariableReference node
      if (content.startsWith('@')) {
        const identifier = content.substring(1);
        // Only create variable reference if it's a valid identifier
        if (/^[a-zA-Z_][a-zA-Z0-9_]*/.test(identifier)) {
          return helpers.createNode(NodeType.VariableReference, {
            identifier: identifier,
            valueType: 'varIdentifier',
            location: location()
          });
        }
      }
      // Otherwise create a Text node
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
      
      // If it starts with @, create a VariableReference node
      if (content.startsWith('@')) {
        const identifier = content.substring(1);
        // Only create variable reference if it's a valid identifier
        if (/^[a-zA-Z_][a-zA-Z0-9_]*/.test(identifier)) {
          return helpers.createNode(NodeType.VariableReference, {
            identifier: identifier,
            valueType: 'varIdentifier',
            location: location()
          });
        }
      }
      // Otherwise create a Text node
      return helpers.createNode(NodeType.Text, {
        content: content,
        location: location()
      });
    }

RawArgChar
  = !(["'`] / "," / ")" / "\\") char:. { return char; }