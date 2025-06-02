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


// SEMANTIC: Path content - knows it's parsing a file path
SemanticPathContent "Semantic path content with @var interpolation"
  = '[' parts:PathParts ']' {
      // Just return the path parts - section handling should be at directive level
      return parts;
    }

// Parts that make up a path
PathParts "Path component parts"
  = parts:(SpecialVariable / Variable / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Section name - everything after # until ]
SectionName "Section name"
  = chars:$(!']' .)+ { return chars.trim(); }

// Content inside single brackets for backward compatibility
BracketContent "Content with @var interpolation"
  = SemanticPathContent

// Removed: SectionBracketContent - now handled by directive-specific semantic parsers

// SEMANTIC: Command bracket content - knows it's parsing a shell command
SemanticCommandBracketContent "Semantic command content with @var interpolation"
  = '[' parts:(SpecialVariable / Variable / QuotedCommandString / CommandTextContent)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Regular command bracket content for backward compatibility
CommandBracketContent "Command content with @var interpolation"
  = SemanticCommandBracketContent

// Quoted strings in commands - preserve quotes for shell semantics
QuotedCommandString "Quoted string in command"
  = '"' content:DoubleQuotedCommandContent '"' {
      // Preserve quotes in command context
      return helpers.createNode(NodeType.Text, { 
        content: '"' + content + '"', 
        location: location() 
      });
    }
  / "'" content:SingleQuotedCommandContent "'" {
      // Single quotes = no interpolation in shell
      return helpers.createNode(NodeType.Text, { 
        content: "'" + content + "'", 
        location: location() 
      });
    }

// Double quoted content - allows @var interpolation
DoubleQuotedCommandContent
  = parts:(SpecialVariable / Variable / DoubleQuotedText)* {
      // Flatten to string preserving variable references
      return parts.map(p => {
        if (p.type === NodeType.VariableReference) {
          return '@' + p.identifier;
        }
        return p.content || '';
      }).join('');
    }

// Single quoted content - no interpolation
SingleQuotedCommandContent  
  = chars:(!"'" char:. { return char; })* {
      return chars.join('');
    }

// Text inside double quotes
DoubleQuotedText
  = chars:(!['"@] char:. { return char; })+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

// Permissive text content for commands - allows everything except @ and the final closing ]
CommandTextContent "Permissive command text content"
  = chars:CommandBracketChar+ { 
      const content = chars.join('');
      helpers.debug('CommandTextContent matched', { content });
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

// Smart bracket character matching - only stops at ] that ends the command
CommandBracketChar
  = EscapeSequence
  / !"@" &{
      // Use our helper to check if this is a command-ending bracket
      return !helpers.isCommandEndingBracket(input, peg$currPos);
    } char:. { return char; }



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

// SEMANTIC: Code content - knows it's parsing code, preserves EVERYTHING literally
SemanticCodeContent "Semantic code content without any interpolation"
  = '[' content:$(CodeLiteralContent) ']' { 
      // In code context, everything is literal - no @ processing, no escapes
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }

// Direct code content for backward compatibility
DirectCodeContent "Code content without interpolation"
  = SemanticCodeContent
  / content:$([^[\n]+) { 
      // Fallback for unbracketed code - must consume at least one character
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }

// Code literal content - preserves absolutely everything including nested brackets
CodeLiteralContent "Literal code content with natural bracket nesting"
  = parts:CodeLiteralPart* {
      return parts.join('');
    }

// Parts of code - handle nested brackets naturally
CodeLiteralPart
  = '[' inner:CodeLiteralContent ']' {
      // Preserve brackets in code
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }

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
        length: Array.isArray(rule) ? rule.length : 'not array',
        hasType: rule && typeof rule === 'object' && 'type' in rule
      });
      
      // Check if this is actually a double-bracketed section
      if (rule && typeof rule === 'object' && !Array.isArray(rule) && rule.type === 'doubleBracketSection') {
        return rule; // Pass through the section structure
      }
      
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
// SEMANTIC FORK PATTERNS - Help directives choose content type
// -------------------------------------------------------------

// Semantic text content - looks ahead to determine content type
SemanticTextContent "Semantic content for @text directive"
  = "[[" {
      // Double brackets = template content
      helpers.debug('SemanticTextContent detected [[');
      return { type: 'template', lookahead: '[[' };
    }
  / "[" ahead:$([^\]]*) "]" &{
      // Look for # to determine if it's a section
      return ahead.includes(' # ');
    } {
      helpers.debug('SemanticTextContent detected [ with section');
      return { type: 'section', lookahead: '[' };
    }
  / "[" {
      // Single bracket without section = path
      helpers.debug('SemanticTextContent detected [');
      return { type: 'path', lookahead: '[' };
    }
  / "@run" {
      // Run reference
      helpers.debug('SemanticTextContent detected @run');
      return { type: 'run', lookahead: '@run' };
    }
  / "\"" {
      // Quoted literal
      helpers.debug('SemanticTextContent detected "');
      return { type: 'literal', lookahead: '"' };
    }
  / "'" {
      // Quoted literal
      helpers.debug('SemanticTextContent detected \'');
      return { type: 'literal', lookahead: '\'' };
    }

// -------------------------------------------------------------
// WRAPPED PATTERNS - Used by directives, handle raw string construction
// -------------------------------------------------------------

// For paths in path, import, exec, add directives
WrappedPathContent "Wrapped path content"
  = content:PathStyleInterpolation {
      // PathStyleInterpolation already handles brackets
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
        contentHasType: content && content.type,
        wrapperType: content && content.wrapperType
      });
      
      // Regular template content
      const rawString = helpers.reconstructRawString(content.content);
      
      return {
        parts: content.content,
        raw: rawString,
        wrapperType: content.wrapperType
      };
    }

// For commands in run, exec directives
WrappedCommandContent "Wrapped command content"
  = content:CommandContentInterpolation {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      return {
        parts: content,
        raw: rawString
      };
    }

// Specialized command interpolation that allows complex shell syntax
CommandContentInterpolation "Command content interpolation patterns"
  = LiteralOnlyContent          // "literal command"
  / CommandBracketContent       // [command with @var] - permissive for shell commands
  / InterpolatedTemplateContent // [[command with {{var}}]]

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