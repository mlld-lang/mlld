// -- CLEAN INTERPOLATION MODEL --
// 1. Quoted strings ("", '', ``): Literal content, no interpolation
// 2. Single brackets []: @var interpolation for paths/commands
// 3. Double brackets [[]]: {{var}} interpolation for templates

// -------------------------------------------------------------
// QUOTED STRING LITERALS - No variable interpolation
// -------------------------------------------------------------

// Common literal string rule for all quote types (", ', `)
LiteralStringContent "String literal content without interpolation"
  = chars:LiteralStringChar+ {
      return [helpers.createNode(NodeType.Text, { content: chars.join('') }, location())];
    }
  / "" { return []; }

LiteralStringChar
  = !('"' / "'" / '`') char:. { return char; }
  / '\\' esc:. { return esc; } // Handle escape sequences

// String literal with quotes - no interpolation
LiteralString "Non-interpolated string literal"
  = '"' content:LiteralStringContent '"' { return content; }
  / "'" content:LiteralStringContent "'" { return content; }
  / "`" content:LiteralStringContent "`" { return content; }

// -------------------------------------------------------------
// SINGLE BRACKET CONTENT - @var interpolation (for paths/commands)
// -------------------------------------------------------------

// Literal text segment within brackets
BracketLiteralSegment
  = chars:(!(']' / '@') .)+ { 
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

// Path separator should be a distinct node in paths
PathSeparator
  = '/' { return helpers.createNode(NodeType.PathSeparator, { value: '/' }, location()); }

// Content inside single brackets - allows @var interpolation
BracketContent "Content allowing @var interpolation"
  = parts:(AtVar / BracketLiteralSegment / PathSeparator)+ {
      return parts;
    }
  / "" { return []; }

// Single bracket container - for @var interpolation
BracketContainer
  = '[' content:BracketContent ']' { return content; }

// -------------------------------------------------------------
// DOUBLE BRACKET CONTENT - {{var}} interpolation (for templates)
// -------------------------------------------------------------

// Literal text segment within double brackets
DoubleBracketLiteralSegment
  = chars:(!(']]' / '{{') .)+ { 
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

// Content inside double brackets - allows {{var}} interpolation
DoubleBracketContent "Content allowing {{var}} interpolation"
  = parts:(InterpolationVar / DoubleBracketLiteralSegment)+ {
      return parts;
    }
  / "" { return []; }

// Double bracket container - for {{var}} interpolation
DoubleBracketContainer
  = '[[' content:DoubleBracketContent ']]' { return content; }

// -------------------------------------------------------------
// PATH-SPECIFIC SYNTACTIC SUGAR
// -------------------------------------------------------------

// Special rule for paths without quotes/brackets (unquoted paths)
// This is syntactic sugar for common use cases
UnquotedPath "Unquoted path with @var interpolation"
  = parts:(AtVar / UnquotedPathSegment / PathSeparator)+ {
      return parts;
    }

UnquotedPathSegment
  = chars:(![ \t\r\n] !(PathSeparator / '@' / '$') .)+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

// -------------------------------------------------------------
// COMMAND-SPECIFIC SYNTACTIC SUGAR
// -------------------------------------------------------------

// Special rule for command lines without quotes/brackets
UnquotedCommand "Unquoted command with @var interpolation"
  = parts:(AtVar / UnquotedCommandSegment)+ {
      return parts;
    }

UnquotedCommandSegment
  = chars:(![ \t\r\n;] !('@' / '$') .)+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }