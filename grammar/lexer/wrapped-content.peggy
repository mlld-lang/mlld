// MELD WRAPPED CONTENT PATTERNS
// A comprehensive system for handling interpolation in different contexts

/* 
# Pattern Hierarchy
WrappedPathContent (Used by: path, import, exec, add)
├── PathStyleInterpolation
│   ├── LiteralString (handles quotes, removes them)
│   ├── BracketContent (handles [..] with @var)
│   │   ├── AtVar
│   │   ├── PathSeparator
│   │   └── TextSegment (for non-variable text)
│   └── UnquotedPath (for paths without any delimiters)
│       ├── AtVar
│       ├── PathSeparator
│       └── TextSegment

WrappedTemplateContent (Used by: text, add)
├── TemplateStyleInterpolation
│   ├── LiteralString (handles quotes, removes them)
│   └── DoubleBracketContent (handles [[..]] with {{var}})
│       ├── InterpolationVar
│       └── TextSegment

WrappedCommandContent (Used by: run, exec)
├── CommandStyleInterpolation
│   ├── LiteralString
│   ├── BracketContent
│   ├── DoubleBracketContent
│   └── UnquotedCommand
│       ├── AtVar
│       └── TextSegment

WrappedCodeContent (Used by: run, exec)
└── DirectCodeContent (no variable interpolation)
*/

// -------------------------------------------------------------
// BASE PATTERNS - Atomic elements used by higher-level patterns
// -------------------------------------------------------------

// Simple text segment without any special characters
TextSegment "Plain text segment"
  = chars:$(![ \t\r\n/\]@${{}] .)+ { 
      return helpers.createNode(NodeType.Text, { content: chars }, location());
    }

// Path separator character as a distinct node
PathSeparator "Path separator"
  = '/' { 
      return helpers.createNode(NodeType.PathSeparator, { value: '/' }, location()); 
    }

// Section marker character as a distinct node
SectionMarker "Section marker"
  = '#' { 
      return helpers.createNode(NodeType.SectionMarker, { value: '#' }, location()); 
    }

// @var variable reference (directly uses AtVar from variable-access.peggy)
// Note: @var is an imported rule defined in variable-access.peggy

// {{var}} variable interpolation (directly uses InterpolationVar from variable-access.peggy)
// Note: InterpolationVar is an imported rule defined in variable-access.peggy

// -------------------------------------------------------------
// MID-LEVEL PATTERNS - Handle delimiters and basic structures
// -------------------------------------------------------------

// Quoted string - captures content within quotes WITHOUT including the quotes
LiteralString "String literal without interpolation"
  = '"' content:$(!'"' .)* '"' { 
      // Return only the content within quotes as a Text node
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / "'" content:$(!'\'')* "'" { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / "`" content:$(!'`')* "`" { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }

// Content inside single brackets with @var interpolation
BracketContent "Content with @var interpolation"
  = '[' parts:(AtVar / TextSegment / PathSeparator)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Content inside double brackets with {{var}} interpolation
DoubleBracketContent "Content with {{var}} interpolation"
  = '[[' parts:(InterpolationVar / TextSegment)* ']]' {
      // Return only the content within double brackets, not the brackets themselves
      return parts;
    }

// Unquoted path with @var interpolation (no delimiters)
UnquotedPath "Unquoted path with @var interpolation"
  = parts:(AtVar / TextSegment / PathSeparator)+ {
      return parts;
    }

// Unquoted command with @var interpolation (no delimiters)
UnquotedCommand "Unquoted command with @var interpolation"
  = parts:(AtVar / TextSegment)+ {
      return parts;
    }

// Direct code content without interpolation
DirectCodeContent "Code content without interpolation"
  = '[' content:$(!']' .)* ']' { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / content:$([^[\n]+) { 
      // Fallback for unbracketed code
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }

// -------------------------------------------------------------
// COMBO PATTERNS - Combine different types of patterns
// -------------------------------------------------------------

// Path-style interpolation: quotes, brackets, or unquoted
PathStyleInterpolation "Path interpolation patterns"
  = LiteralString
  / BracketContent
  / UnquotedPath

// Template-style interpolation: quotes or double brackets
TemplateStyleInterpolation "Template interpolation patterns"
  = LiteralString
  / DoubleBracketContent

// Command-style interpolation: all types
CommandStyleInterpolation "Command interpolation patterns"
  = LiteralString
  / BracketContent
  / DoubleBracketContent
  / UnquotedCommand

// -------------------------------------------------------------
// WRAPPED PATTERNS - Used by directives, handle raw string construction
// -------------------------------------------------------------

// For paths in path, import, exec, add directives
WrappedPathContent "Wrapped path content"
  = content:PathStyleInterpolation {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      return {
        parts: content,
        raw: rawString
      };
    }

// For templates in text, add directives
WrappedTemplateContent "Wrapped template content"
  = content:TemplateStyleInterpolation {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      return {
        parts: content,
        raw: rawString
      };
    }

// For commands in run, exec directives
WrappedCommandContent "Wrapped command content"
  = content:CommandStyleInterpolation {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      return {
        parts: content,
        raw: rawString
      };
    }

// For code blocks in run, exec directives
WrappedCodeContent "Wrapped code content"
  = content:DirectCodeContent {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      return {
        parts: content,
        raw: rawString
      };
    }