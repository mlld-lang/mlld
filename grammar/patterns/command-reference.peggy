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
  = "(" _ args:CommandArgsList? _ ")" {
      return args || [];
    }

CommandArgsList "command arguments list"
  = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* {
      return [first, ...rest];
    }

CommandArg "command argument"
  = str:StringLiteral {
      return { type: 'string', value: str };
    }
  / varRef:Variable {
      return { type: 'variable', value: varRef };
    }
  / chars:RawArgChar+ {
      return { type: 'raw', value: chars.join('').trim() };
    }

RawArgChar
  = !("," / ")") char:. { return char; }