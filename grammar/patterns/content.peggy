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
// COMBO PATTERNS - Combine different types of patterns
// -------------------------------------------------------------

// Path-style interpolation: quotes or brackets only (no unquoted paths)
PathStyleInterpolation "Path interpolation patterns"
  = LiteralContent
  / BracketContent

// Template-style interpolation: quotes or double brackets
TemplateStyleInterpolation "Template interpolation patterns"
  = // Direct handling of double bracket content as first alternative
    '[[' content:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('TemplateStyleInterpolation matched [[...]] directly', { 
        content, 
        isArray: Array.isArray(content),
        length: Array.isArray(content) ? content.length : 'not array'
      });
      
      // Instead of returning just the content, return an object with content and wrapper type
      return {
        content: content,
        wrapperType: 'doubleBracket'
      };
    }  
  / rule:LiteralContent {
      helpers.debug('TemplateStyleInterpolation matched LiteralContent', { rule });
      
      // If this is a quote-wrapped literal, determine its quote type
      let wrapperType = 'none';
      
      // For now, just mark it as not a template wrapper
      return {
        content: rule,
        wrapperType: wrapperType
      };
    }
  / rule:DoubleBracketContent {
      helpers.debug('TemplateStyleInterpolation matched DoubleBracketContent', { 
        rule, 
        isArray: Array.isArray(rule),
        length: Array.isArray(rule) ? rule.length : 'not array'
      });
      
      return {
        content: rule,
        wrapperType: 'doubleBracket'
      };
    }

// Command-style interpolation: all types
CommandStyleInterpolation "Command interpolation patterns"
  = LiteralContent
  / BracketContent
  / DoubleBracketContent

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