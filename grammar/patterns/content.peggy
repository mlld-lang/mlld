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

// Literal content - no interpolation (both single and double quotes)
LiteralContent "Literal content without interpolation"
  = '"' content:EscapedStringContent '"' { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / "'" content:EscapedSingleStringContent "'" { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }


// REMOVED: Bracket syntax for paths - use <file.md> or "file.md" instead
// SemanticPathContent was here

// SEMANTIC: Section content for @add directive - shared pattern
SemanticSectionContent "Semantic section content"
  = '[' pathParts:PathParts _ '#' _ section:SectionIdentifier ']' {
      // Path with section - create structured response
      const pathString = helpers.reconstructRawString(pathParts);
      
      // Extract section raw content
      let sectionRaw;
      if (section.type === 'VariableReference') {
        sectionRaw = '@' + section.identifier;
      } else if (typeof section === 'string') {
        sectionRaw = section;
      } else {
        sectionRaw = section.content || section.identifier || '';
      }
      
      return {
        type: 'sectionPath',
        parts: pathParts,
        section: sectionRaw,
        sectionNodes: Array.isArray(section) ? section : [section],
        raw: pathString + ' # ' + sectionRaw
      };
    }

// Parts that make up a path
PathParts "Path component parts"
  = parts:(SpecialVariable / UnifiedVariable / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Section name - everything after # until ]
SectionName "Section name"
  = chars:$(!']' .)+ { return chars.trim(); }

// REMOVED: BracketContent - use AlligatorExpression or quoted strings instead

// Removed: SectionBracketContent - now handled by directive-specific semantic parsers

// SEMANTIC: Command bracket content - knows it's parsing a shell command
SemanticCommandBracketContent "Semantic command content with @var interpolation"
  = '[' parts:(SpecialVariable / UnifiedVariableNoTail / QuotedCommandString / CommandTextContent)* ']' {
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
  = parts:(SpecialVariable / UnifiedVariable / DoubleQuotedText)* {
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

// MOVED TO segments.peggy - DoubleQuotedText and DoubleQuotedChar are now defined there
// since they're used by multiple patterns across the grammar

// REMOVED: BacktickInterpolation has been replaced by UnifiedBacktickInterpolation
// All uses have been migrated to the unified pattern in unified-quotes.peggy

// Function call in backtick template
BacktickExecInvocation
  = "@" name:BaseIdentifier &"(" argList:UnifiedArgumentList {
      helpers.debug('BacktickExecInvocation matched', { name, argList });
      
      // Extract arguments from unified argument list
      const args = argList.arguments || [];
      
      // Create an exec invocation node
      const commandRef = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args,
        isCommandReference: true
      };
      
      return helpers.createExecInvocation(commandRef, null, location());
    }

// Text inside backticks (excluding @ and < for interpolation)
BacktickTextSegment
  = chars:BacktickTemplateChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
    }

BacktickTemplateChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / ![`@<] char:. { return char; }

// Text inside double colons (excluding ::, @ and < for interpolation)
DoubleColonTextSegment
  = chars:(!("::" / "@" / "<") char:. { return char; })+ {
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



// Content inside double colons with @var interpolation and <file.md>
DoubleColonContent "Content with @var interpolation"
  = '::' parts:(DoubleColonInterpolation)* '::' {
      helpers.debug('DoubleColonContent matched ::...::', { parts });
      
      // Strip formatting newlines at grammar level
      // Process the parts array to remove leading/trailing newlines
      let processedParts = parts;
      
      // Remove leading newline if first part is a Text node starting with \n
      if (processedParts.length > 0 && processedParts[0].type === 'Text' && processedParts[0].content) {
        if (processedParts[0].content === '\n') {
          // If it's just a newline, remove the whole node
          processedParts = processedParts.slice(1);
        } else if (processedParts[0].content.startsWith('\n')) {
          // If it starts with a newline, strip it
          processedParts[0] = {
            ...processedParts[0],
            content: processedParts[0].content.slice(1)
          };
        }
      }
      
      // Remove trailing newline if last part is a Text node ending with \n
      if (processedParts.length > 0) {
        const lastIndex = processedParts.length - 1;
        const lastPart = processedParts[lastIndex];
        if (lastPart.type === 'Text' && lastPart.content) {
          if (lastPart.content === '\n') {
            // If it's just a newline, remove the whole node
            processedParts = processedParts.slice(0, -1);
          } else if (lastPart.content.endsWith('\n')) {
            // If it ends with a newline, strip it
            processedParts[lastIndex] = {
              ...lastPart,
              content: lastPart.content.slice(0, -1)
            };
          }
        }
      }
      
      // Return only the content within double colons, not the colons themselves
      return processedParts;
    }

// NEW: Interpolation pattern for :: syntax (now @var interpolation)
DoubleColonInterpolation
  = BacktickExecInvocation      // @func(args)
  / FileReferenceInterpolation   // <file.md>
  / TemplateVariableReference   // @var - NO tail modifier constraints
  / "@" !BaseIdentifier char:. { // @ followed by non-identifier
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  / DoubleColonTextSegment      // Plain text

// NEW: Triple colon content with {{var}} interpolation
TripleColonContent "Content with {{var}} interpolation"
  = ':::' parts:(InterpolationVar / FileReferenceInterpolation / TemplateTextSegment)* ':::' {
      helpers.debug('TripleColonContent matched :::...:::', { parts });
      
      // Strip formatting newlines (same as current DoubleColonContent)
      let processedParts = parts;
      
      // Remove leading newline if first part is a Text node starting with \n
      if (processedParts.length > 0 && processedParts[0].type === 'Text' && processedParts[0].content) {
        if (processedParts[0].content === '\n') {
          processedParts = processedParts.slice(1);
        } else if (processedParts[0].content.startsWith('\n')) {
          processedParts[0] = {
            ...processedParts[0],
            content: processedParts[0].content.slice(1)
          };
        }
      }
      
      // Remove trailing newline if last part is a Text node ending with \n
      if (processedParts.length > 0) {
        const lastIndex = processedParts.length - 1;
        const lastPart = processedParts[lastIndex];
        if (lastPart.type === 'Text' && lastPart.content) {
          if (lastPart.content === '\n') {
            processedParts = processedParts.slice(0, -1);
          } else if (lastPart.content.endsWith('\n')) {
            processedParts[lastIndex] = {
              ...lastPart,
              content: lastPart.content.slice(0, -1)
            };
          }
        }
      }
      
      return processedParts;
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

// Variable reference in unquoted paths - use unified pattern
UnquotedPathVar
  = UnifiedVariableNoTail

// Text segment for unquoted paths - handles @ when not a valid variable
UnquotedPathText "Unquoted path text"
  = chars:$(![ \t\r\n/\]{}] .)+ {
      helpers.debug('UnquotedPathText matched', { chars });
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }

// Unquoted command with @var interpolation (no delimiters)
UnquotedCommand "Unquoted command with @var interpolation"
  = parts:(UnifiedAtVar / BaseTextSegment)+ {
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

// DEPRECATED AND REMOVED: These patterns have been replaced by UnifiedQuote patterns
// LiteralOnlyContent -> Use UnifiedSingleQuote and extract .content
// InterpolatedDoubleQuoteContent -> Use UnifiedDoubleQuote and extract .content

// REMOVED: InterpolatedPathContent - bracket syntax no longer supported

// Template content with interpolation (double and triple colons)
InterpolatedTemplateContent "Template content with interpolation"
  = DoubleColonContent    // Now @var interpolation
  / TripleColonContent    // Now {{var}} interpolation

// -------------------------------------------------------------
// COMBO PATTERNS - Combine different types of patterns with clear semantics
// -------------------------------------------------------------

// REMOVED: PathStyleInterpolation - bracket syntax no longer supported

// REMOVED: TemplateStyleInterpolation has been completely replaced by UnifiedQuoteOrTemplate
// All uses have been migrated to use the unified patterns from:
// - unified-quotes.peggy for quote patterns
// - unified-templates.peggy for template patterns  
// - unified-quote-template.peggy for the combined pattern

// Command-style interpolation: supports all relevant interpolation types
CommandStyleInterpolation "Command interpolation patterns"
  = quote:UnifiedDoubleQuote { return quote.content; }  // "command with @var"
  / quote:UnifiedSingleQuote { return quote.content; }  // 'literal command'
  / CommandBracketContent         // [command with @var] - permissive for shell commands
  / InterpolatedTemplateContent   // [[command with {{var}}]]

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
  / "/run" {
      // Run reference
      helpers.debug('SemanticTextContent detected /run');
      return { type: 'run', lookahead: '/run' };
    }
  / "\"" {
      // Double quoted string with interpolation
      helpers.debug('SemanticTextContent detected "');
      return { type: 'template', lookahead: '"' };
    }
  / "'" {
      // Quoted literal
      helpers.debug('SemanticTextContent detected \'');
      return { type: 'literal', lookahead: '\'' };
    }

// -------------------------------------------------------------
// WRAPPED PATTERNS - Used by directives, handle raw string construction
// -------------------------------------------------------------

// REMOVED: WrappedPathContent - bracket syntax no longer supported
// Paths should use quoted strings or alligator syntax instead

// For templates in text, add directives
WrappedTemplateContent "Wrapped template content"
  = content:UnifiedQuoteOrTemplate {
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
  = quote:UnifiedDoubleQuote { return quote.content; }  // "command with @var"
  / quote:UnifiedSingleQuote { return quote.content; }  // 'literal command'
  / CommandBracketContent         // [command with @var] - permissive for shell commands
  / InterpolatedTemplateContent   // [[command with {{var}}]]

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