// Pattern: command-reference.peggy
// Purpose: Shared command reference pattern for exec/run directives
// Used by: exec.peggy, add.peggy (for execReference)
// Note: This file assumes helpers and NodeType are available from peg$imports

// Shared command reference pattern
// Matches: commandName(arg1, arg2, @var)
CommandReference "command reference"
  = name:BaseIdentifier _ argList:UnifiedArgumentList? {
      helpers.debug('CommandReference matched', { name, argList });
      
      // Extract arguments from unified argument list
      const args = argList ? (argList.arguments || []) : [];
      
      return {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args,
        isCommandReference: true
      };
    }

// All argument patterns now use UnifiedArgumentList directly

// Temporary compatibility wrapper - still used by other files
CommandArgumentList "command arguments list"
  = _ args:UnifiedArgumentListItems { return args; }


// Nested function call in command arguments
NestedExecInvocation "nested exec invocation"
  = "@" name:BaseIdentifier argList:UnifiedArgumentList {
      helpers.debug('NestedExecInvocation matched', { name, argList });
      
      // Extract arguments from unified argument list
      const args = argList.arguments || [];
      
      // Create a command reference
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args,
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
