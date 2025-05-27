// MLLD CONTENT PATTERNS
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
// No interpolation for quoted strings - but with escape sequence support
LiteralContent "Literal content without interpolation"
  = '"' content:EscapedStringContent '"' { 
      // Return the escaped content as a Text node
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / "'" content:EscapedSingleStringContent "'" { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / "`" content:EscapedBacktickStringContent "`" { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }


// Content inside single brackets with @var interpolation
BracketContent "Content with @var interpolation"
  = '[' parts:(BracketVar / PathTextSegment / PathSeparator)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Variable reference within bracketed content
BracketVar
  = "@" id:BaseIdentifier fields:AnyFieldAccess* { 
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      helpers.debug('CreateVAR in BracketContent', { id, node, fields: fields });
      return node;
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
  = parts:(UnquotedPathPart)+ {
      return parts;
    }

// Individual part of an unquoted path
UnquotedPathPart
  = PathSeparator
  / UnquotedPathVar
  / UnquotedPathText

// Variable reference in unquoted paths - without VariableContext check
UnquotedPathVar
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      helpers.debug('CreateVAR in UnquotedPath', { id: normalizedId, node, fields: fields });
      return node;
    }

// Text segment for unquoted paths - handles @ when not a valid variable
UnquotedPathText "Unquoted path text"
  = chars:$(![ \t\r\n/\]{}] .)+ {
      helpers.debug('UnquotedPathText matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// Unquoted command with @var interpolation (no delimiters)
UnquotedCommand "Unquoted command with @var interpolation"
  = parts:(AtVar / BaseTextSegment)+ {
      return parts;
    }

// Direct code content without interpolation
DirectCodeContent "Code content without interpolation"
  = '[' content:$(!']' .)* ']' { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / content:$([^[\n]+) { 
      // Fallback for unbracketed code - must consume at least one character
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }

// -------------------------------------------------------------
// SEMANTIC DELIMITER PATTERNS - Clear semantic meaning for each delimiter type
// -------------------------------------------------------------

// Literal text without any interpolation (quotes only)
LiteralOnlyContent "Literal text without any interpolation"
  = LiteralContent  // Already exists: "...", '...', `...`

// Path content with @var interpolation (brackets only)
InterpolatedPathContent "Path content with @var interpolation" 
  = BracketContent  // Already exists: [...]

// Template content with {{var}} interpolation (double brackets only)
InterpolatedTemplateContent "Template content with {{var}} interpolation"
  = DoubleBracketContent  // Already exists: [[...]]

// -------------------------------------------------------------
// COMBO PATTERNS - Combine different types of patterns with clear semantics
// -------------------------------------------------------------

// Path-style interpolation: brackets only (enforces semantic clarity)
PathStyleInterpolation "Path interpolation patterns"
  = InterpolatedPathContent  // [content with @var] - all paths must be bracketed

// Template-style interpolation: templates with {{var}} or literal text
TemplateStyleInterpolation "Template interpolation patterns"  
  = rule:InterpolatedTemplateContent {
      helpers.debug('TemplateStyleInterpolation matched InterpolatedTemplateContent', { 
        rule, 
        isArray: Array.isArray(rule),
        length: Array.isArray(rule) ? rule.length : 'not array'
      });
      
      return {
        content: rule,
        wrapperType: 'doubleBracket'
      };
    }
  / rule:LiteralOnlyContent {
      helpers.debug('TemplateStyleInterpolation matched LiteralOnlyContent', { rule });
      
      return {
        content: rule,
        wrapperType: 'literal'
      };
    }

// Command-style interpolation: supports all relevant interpolation types
CommandStyleInterpolation "Command interpolation patterns"
  = LiteralOnlyContent          // "literal command"
  / InterpolatedPathContent     // [command with @var] 
  / InterpolatedTemplateContent // [[command with {{var}}]]

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
        firstItemType: Array.isArray(content.content) && content.content.length > 0 ? content.content[0].type : 'no items',
        wrapperType: content.wrapperType
      });
      
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content.content);
      
      return {
        parts: content.content,
        raw: rawString,
        wrapperType: content.wrapperType
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