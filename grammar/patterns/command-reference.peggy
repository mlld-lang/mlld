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
      return [first, ...rest];
    }

CommandArgument "command argument"
  = str:StringLiteral {
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
  / chars:RawArgChar+ {
      const content = chars.join('').trim();
      // If it starts with @, create a VariableReference node
      if (content.startsWith('@')) {
        return helpers.createNode(NodeType.VariableReference, {
          identifier: content.substring(1),
          valueType: 'varIdentifier',
          location: location()
        });
      } else {
        // Otherwise create a Text node
        return helpers.createNode(NodeType.Text, {
          content: content,
          location: location()
        });
      }
    }

RawArgChar
  = !("," / ")") char:. { return char; }