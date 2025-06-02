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
  = '[' parts:(Variable / PathTextSegment / PathSeparator)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
    }

// Section-aware bracket content for path # section syntax
SectionBracketContent "Bracketed path with section extraction"
  = '[' &{
      // Look ahead to check if this is a section pattern
      const remaining = input.substring(location().start.offset + 1);
      const endIndex = remaining.indexOf(']');
      if (endIndex === -1) return false;
      const content = remaining.substring(0, endIndex);
      
      // Check if it matches the section pattern
      const match = content.match(/^([^#]+)\s+#\s+(.+)$/);
      if (!match) return false;
      
      const pathPart = match[1].trim();
      const sectionPart = match[2].trim();
      
      // Path should look path-like: has valid file extension or contains /
      // Valid extensions: 2-4 alphabetic characters (not just numbers)
      const hasExtension = /\.[a-zA-Z]{2,4}$/.test(pathPart);
      const hasSlash = pathPart.includes('/');
      const looksLikePath = hasExtension || hasSlash;
      
      return looksLikePath && pathPart.length > 0 && sectionPart.length > 0;
    } pathText:$([^#\]]*) _ '#' _ sectionText:$([^\]]*) ']' {
      // Parse path and section as simple text for now
      const pathParts = pathText.trim() ? [helpers.createNode(NodeType.Text, { content: pathText.trim(), location: location() })] : [];
      const sectionParts = sectionText.trim() ? [helpers.createNode(NodeType.Text, { content: sectionText.trim(), location: location() })] : [];
      
      return {
        type: 'sectionPath',
        path: pathParts,
        section: sectionParts,
        wrapperType: 'bracket'
      };
    }

// Content inside command brackets - much more permissive for shell commands
CommandBracketContent "Command content with @var interpolation"
  = '[' parts:(Variable / CommandTextContent)* ']' {
      // Return only the content within brackets, not the brackets themselves
      return parts;
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
  = '[[' &{
      // Look ahead to check if this is a section pattern (path-like # section-name)
      const remaining = input.substring(location().start.offset + 2);
      const endIndex = remaining.indexOf(']]');
      if (endIndex === -1) return false;
      const content = remaining.substring(0, endIndex);
      
      // Check if it matches the section pattern: something path-like before #
      const match = content.match(/^([^#]+)\s+#\s+(.+)$/);
      if (!match) return false;
      
      const pathPart = match[1].trim();
      const sectionPart = match[2].trim();
      
      // Path should look path-like: has valid file extension or contains /
      // Valid extensions: 2-4 alphabetic characters (not just numbers)
      const hasExtension = /\.[a-zA-Z]{2,4}$/.test(pathPart);
      const hasSlash = pathPart.includes('/');
      const looksLikePath = hasExtension || hasSlash;
      
      // Section should not start with another # (that would be a heading)
      const notHeading = !sectionPart.startsWith('#');
      
      return looksLikePath && notHeading && pathPart.length > 0 && sectionPart.length > 0;
    } pathText:$([^#]*) _ '#' _ sectionText:$([^\]]*) ']]' {
      // This is a double-bracketed section path
      const pathParts = [helpers.createNode(NodeType.Text, { content: pathText.trim(), location: location() })];
      const sectionParts = [helpers.createNode(NodeType.Text, { content: sectionText.trim(), location: location() })];
      
      return {
        type: 'doubleBracketSection',
        path: pathParts,
        section: sectionParts,
        wrapperType: 'doubleBracket'
      };
    }
  / '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
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
  = '[' content:$(CodeBracketContent) ']' { 
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / content:$([^[\n]+) { 
      // Fallback for unbracketed code - must consume at least one character
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }

// Code content inside brackets - respects bracket nesting for programming languages
CodeBracketContent "Code content with bracket nesting support"
  = chars:CodeBracketChar* {
      return chars.join('');
    }

// Character matcher for code blocks - only stops at ] that ends the code block
CodeBracketChar
  = EscapeSequence
  / &{
      // Use our helper to check if this is a code-ending bracket
      return !helpers.isCommandEndingBracket(input, peg$currPos);
    } char:. { return char; }

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
  = SectionBracketContent    // [path # section] - section extraction takes precedence
  / InterpolatedPathContent  // [content with @var] - all paths must be bracketed

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
// WRAPPED PATTERNS - Used by directives, handle raw string construction
// -------------------------------------------------------------

// For paths in path, import, exec, add directives
WrappedPathContent "Wrapped path content"
  = content:PathStyleInterpolation {
      // Handle section extraction as a special case
      if (content.type === 'sectionPath') {
        const pathRaw = helpers.reconstructRawString(content.path);
        const sectionRaw = helpers.reconstructRawString(content.section);
        const rawString = `${pathRaw} # ${sectionRaw}`;
        
        return {
          parts: content.path,
          raw: rawString,
          section: sectionRaw,
          type: 'sectionPath'
        };
      }
      
      // Regular path content
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
      
      // Handle double-bracketed section as a special case
      if (content && typeof content === 'object' && content.type === 'doubleBracketSection') {
        const pathRaw = helpers.reconstructRawString(content.path);
        const sectionRaw = helpers.reconstructRawString(content.section);
        const rawString = `${pathRaw} # ${sectionRaw}`;
        
        return {
          parts: content.path,
          raw: rawString,
          section: sectionRaw,
          type: 'doubleBracketSection',
          wrapperType: 'doubleBracket'
        };
      }
      
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