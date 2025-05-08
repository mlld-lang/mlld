// MELD WRAPPED CONTENT PATTERNS
// A comprehensive system for handling interpolation in different contexts

/* 
# Pattern Hierarchy

WrappedPathContent (Used by: path, import, exec, add)
├── Direct quote handling (double, single or backtick quotes)
│   ├── AtVar
│   ├── InterpolationVar
│   ├── PathSeparator
│   └── QuotedText
└── PathStyleInterpolation (for unquoted values)
    ├── LiteralContent (quotes, properly excluded from content)
    ├── BracketContent (handles [..] with @var)
    │   ├── AtVar
    │   ├── PathSeparator
    │   └── TextSegment (for non-variable text)
    └── UnquotedPath (for paths without any delimiters)
        ├── AtVar
        ├── PathSeparator
        └── TextSegment

WrappedTemplateContent (Used by: text, add)
├── TemplateStyleInterpolation
│   ├── LiteralContent (handles quotes, removes them)
│   └── DoubleBracketContent (handles [[..]] with {{var}})
│       ├── InterpolationVar
│       └── TextSegment

WrappedCommandContent (Used by: run, exec)
├── CommandStyleInterpolation
│   ├── LiteralContent
│   ├── BracketContent
│   ├── DoubleBracketContent
│   └── UnquotedCommand
│       ├── AtVar
│       └── TextSegment

WrappedCodeContent (Used by: run, exec)
└── DirectCodeContent (no variable interpolation)

IMPORTANT:
- Delimiters (quotes, brackets) are handled at the pattern level
- They define content boundaries and are NOT included in the AST
- Each pattern has ONE responsibility (e.g., quote handling, bracket handling)
- No string manipulation should happen after parsing
*/

// -------------------------------------------------------------
// BASE PATTERNS - Atomic elements used by higher-level patterns
// -------------------------------------------------------------

// Simple text segment without any special characters
TextSegment "Plain text segment"
  = chars:$(![ \t\r\n/\]@${{}"'`] .)+ { 
      helpers.debug('TextSegment matched', { chars });
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

// Special text segment for command content that allows quotes and most characters
CommandTextSegment "Command text segment"
  = chars:$(![/\]@${}] .)+ { 
      helpers.debug('CommandTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars }, location());
    }

// Special text segment for template content that allows most characters except interpolation
TemplateTextSegment "Template text segment"
  = chars:$(!('{{' / '}}' / '[[' / ']]') .)+ { 
      helpers.debug('TemplateTextSegment matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars }, location());
    }

// Content inside single brackets with @var interpolation
BracketContent "Content with @var interpolation"
  = '[' parts:(AtVar / CommandTextSegment / PathSeparator)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Content inside double brackets with {{var}} interpolation
DoubleBracketContent "Content with {{var}} interpolation"
  = &{ helpers.debug('Trying to match DoubleBracketContent with [[...]]'); return true; }
    '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
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
  = &{ helpers.debug('Trying to match TemplateStyleInterpolation...'); return true; }
    // Direct handling of double bracket content as first alternative
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
  / &{ helpers.debug('Trying DoubleBracketContent in TemplateStyleInterpolation...'); return true; }
    rule:DoubleBracketContent {
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
  = &{ helpers.debug('Trying to match WrappedTemplateContent...'); return true; }
    content:TemplateStyleInterpolation {
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