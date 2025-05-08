// MELD CONTENT PATTERNS
// A comprehensive system for handling text segments and interpolation in different contexts

/* 
# Pattern Hierarchy

CONTENT TYPES
├── PathContent (Used by: path, import, exec, add)
│   ├── Quoted content (double, single or backtick quotes)
│   └── Unquoted content with variable interpolation
│       ├── Bracketed content [with @var]
│       └── Plain path segments with @var
│
├── TemplateContent (Used by: text, add)
│   ├── Quoted literal content (no interpolation)
│   └── Content with variable interpolation
│       ├── Double bracket content [[with {{var}}]]
│       └── Direct {{var}} references
│
├── CommandContent (Used by: run, exec)
│   ├── Quoted literal commands 
│   ├── Bracketed command segments
│   └── Unquoted command with variables
│
└── CodeContent (Used by: run, exec)
    └── Literal code blocks
*/


// -------------------------------------------------------------
// MID-LEVEL PATTERNS - Handle delimiters and basic structures
// -------------------------------------------------------------

// Quoted string - captures content within quotes WITHOUT including the quotes
// No interpolation for quoted strings - just literal text
LiteralContent "Literal content without interpolation"
  = '"' content:$(!'"' .)* '"' { 
      // Return only the content within quotes as a Text node (no variable processing)
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / "'" content:$(!"'" .)* "'" { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / "`" content:$(!'`' .)* "`" { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }

// Content inside single brackets with @var interpolation
BracketContent "Content with @var interpolation"
  = '[' parts:(AtVar / CommandTextSegment / PathSeparator)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Content inside double brackets with {{var}} interpolation
DoubleBracketContent "Content with {{var}} interpolation"
  = '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('DoubleBracketContent matched [[...]]', { 
        parts: parts,
        isArray: Array.isArray(parts),
        length: Array.isArray(parts) ? parts.length : 'not array',
        firstType: Array.isArray(parts) && parts.length > 0 ? parts[0].type : 'none'
      });
      
      // Return only the content within double brackets, not the brackets themselves
      return parts;
    }
  // Support direct {{var}} without requiring [[ ]] wrapper
  / parts:InterpolationVar {
      helpers.debug('DoubleBracketContent matched {{var}}', { 
        parts: parts,
        type: parts ? parts.type : 'unknown'
      });
      
      return [parts];
    }

// Unquoted path with @var interpolation (no delimiters)
UnquotedPath "Unquoted path with @var interpolation"
  = parts:(AtVar / BaseTextSegment / PathSeparator)+ {
      return parts;
    }

// Unquoted command with @var interpolation (no delimiters)
UnquotedCommand "Unquoted command with @var interpolation"
  = parts:(AtVar / BaseTextSegment)+ {
      return parts;
    }

// Direct code content without interpolation
DirectCodeContent "Code content without interpolation"
  = '[' content:$(!']' .)* ']' { 
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }
  / content:$([^[\n]+) { 
      // Fallback for unbracketed code - must consume at least one character
      return [helpers.createNode(NodeType.Text, { content }, location())];
    }

// -------------------------------------------------------------
// COMBO PATTERNS - Combine different types of patterns
// -------------------------------------------------------------

// Path-style interpolation: quotes, brackets, or unquoted
PathStyleInterpolation "Path interpolation patterns"
  = LiteralContent
  / BracketContent
  / UnquotedPath

// Template-style interpolation: quotes or double brackets
TemplateStyleInterpolation "Template interpolation patterns"
  = // Direct handling of double bracket content as first alternative
    '[[' content:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('TemplateStyleInterpolation matched [[...]] directly', { 
        content, 
        isArray: Array.isArray(content),
        length: Array.isArray(content) ? content.length : 'not array'
      });
      return content;
    }  
  / rule:LiteralContent {
      helpers.debug('TemplateStyleInterpolation matched LiteralContent', { rule });
      return rule;
    }
  / rule:DoubleBracketContent {
      helpers.debug('TemplateStyleInterpolation matched DoubleBracketContent', { 
        rule, 
        isArray: Array.isArray(rule),
        length: Array.isArray(rule) ? rule.length : 'not array'
      });
      return rule;
    }

// Command-style interpolation: all types
CommandStyleInterpolation "Command interpolation patterns"
  = LiteralContent
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
      helpers.debug('WrappedTemplateContent matched', { 
        contentType: typeof content,
        isArray: Array.isArray(content),
        contentLength: Array.isArray(content) ? content.length : 'not array',
        firstItemType: Array.isArray(content) && content.length > 0 ? content[0].type : 'no items'
      });
      
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