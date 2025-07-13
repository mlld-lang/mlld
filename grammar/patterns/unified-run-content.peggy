// UNIFIED RUN CONTENT PATTERN
// Handles the new {...} syntax for both commands and code

/* 
# Unified Run Content

The {...} syntax unifies command and code execution:
- /run {echo "hello"}        - Command (no language keyword)
- /run js {console.log(42)}  - Code (starts with language keyword)

This pattern detects the content type and applies appropriate parsing rules.
*/

// -------------------------------------------------------------
// UNIFIED CONTENT PATTERN - Single entry point for {...}
// -------------------------------------------------------------

// UNIFIED CODE BRACKETS - Parses {code} for language-specific code
// Used by: AtRun directive when language is specified
// Purpose: Parse code content without language detection
UnifiedCodeBrackets "Code brackets {...}"
  = "{" _ content:$(UnifiedCodeContent) _ "}" {
      helpers.debug('UnifiedCodeBrackets matched', { content });
      return {
        content: content.trim(),
        isMultiLine: content.includes('\n')
      };
    }

// UNIFIED COMMAND BRACKETS - Parses {command} for shell commands
// Used by: AtRun directive when no language is specified  
// Purpose: Parse command content with variable interpolation and security checks
UnifiedCommandBrackets "Command brackets {...}"
  = &{ helpers.debug('UnifiedCommandBrackets: Trying to match at position', offset()); return true; }
    "{" 
    &{ helpers.debug('UnifiedCommandBrackets: Matched opening brace'); return true; }
    _ 
    parts:UnifiedCommandParts 
    &{ helpers.debug('UnifiedCommandBrackets: Got parts, looking for closing brace'); return true; }
    _ 
    "}" 
    &{ helpers.debug('UnifiedCommandBrackets: Matched closing brace, entering action'); return true; } {
      helpers.debug('UnifiedCommandBrackets matched with UnifiedCommandParts', { parts });
      
      const rawCommand = helpers.reconstructRawString(parts);
      
      // Extract command bases
      let commandBases = [];
      let rawBases = [];
      
      // Simple command base detection from first text segment
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: parts[0].location
          }));
          rawBases.push(cmdMatch[1]);
        }
      }
      
      return {
        type: 'command',
        subtype: 'runCommand',
        values: {
          command: parts,
          commandBases: commandBases
        },
        raw: {
          command: rawCommand,
          commandBases: rawBases
        },
        meta: {
          isMultiLine: rawCommand.includes('\n'),
          commandCount: commandBases.length,
          hasScriptRunner: false // TODO: Detect script runners
        }
      };
    }

// UNIFIED RUN CONTENT - Detects and parses command vs code
// Used by: Legacy compatibility (will be deprecated)
// Purpose: Unified parsing of [(...))] syntax with type detection
UnifiedRunContent "Unified run content [(...))]"
  = "[(" _ content:UnifiedRunContentInner _ ")]" {
      helpers.debug('UnifiedRunContent matched', { content });
      return content;
    }

// Inner content parser - determines command vs code
UnifiedRunContentInner
  = lang:RunCodeLanguage ws:_ rest:$(UnifiedCodeContent) {
      // Language detected -> Code execution
      helpers.debug('UnifiedRunContentInner detected code', { lang, rest });
      
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: rest.trim(), location: location() });
      
      return {
        type: 'code',
        subtype: 'runCode',
        values: {
          lang: [langNode],
          args: [], // TODO: Could support args in future like [(js(x, y) return x + y)]
          code: [codeNode]
        },
        raw: {
          lang: lang,
          args: [],
          code: rest.trim()
        },
        meta: {
          isMultiLine: rest.includes('\n'),
          language: lang,
          hasVariables: false // Code blocks don't support variable interpolation
        }
      };
    }
  / parts:UnifiedCommandParts {
      // No language -> Command execution
      helpers.debug('UnifiedRunContentInner detected command', { parts });
      
      const rawCommand = helpers.reconstructRawString(parts);
      
      // Extract command bases
      let commandBases = [];
      let rawBases = [];
      
      // Simple command base detection from first text segment
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: parts[0].location
          }));
          rawBases.push(cmdMatch[1]);
        }
      }
      
      return {
        type: 'command',
        subtype: 'runCommand',
        values: {
          command: parts,
          commandBases: commandBases
        },
        raw: {
          command: rawCommand,
          commandBases: rawBases
        },
        meta: {
          isMultiLine: rawCommand.includes('\n'),
          commandCount: commandBases.length,
          hasScriptRunner: false // TODO: Detect script runners
        }
      };
    }

// -------------------------------------------------------------  
// SHELL COMMAND LINE INTEGRATION
// -------------------------------------------------------------

// Parse shell command line content with proper operator checking
ShellCommandLineContent
  = content:$([^}]*) {
      // Use a simple tokenizer approach instead of the full ShellCommandLine parser
      // for now to avoid circular dependencies
      const tokens = [];
      let current = '';
      let inQuote = null;
      
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];
        
        // Check for quotes
        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = char;
          current += char;
        } else if (char === inQuote) {
          inQuote = null;
          current += char;
        } else if (!inQuote) {
          // Check for banned operators
          if (char === '&' && next === '&') {
            helpers.mlldError(`Shell operator AND (&&) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
          } else if (char === '|' && next === '|') {
            helpers.mlldError(`Shell operator OR (||) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
          } else if (char === ';') {
            helpers.mlldError(`Shell operator semicolon (;) is not allowed in mlld. Use separate @run commands.`);
          } else if (char === '>' && next === '>') {
            helpers.mlldError(`Shell append operator (>>) is not allowed in mlld. Use @output directive for file operations.`);
          } else if (char === '>' || char === '<') {
            helpers.mlldError(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
          } else if (char === '&' && next !== '&' && next !== '>') {
            helpers.mlldError(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
          } else {
            current += char;
          }
        } else {
          current += char;
        }
      }
      
      // For now, return a simple structure
      return {
        commands: [{
          type: 'command',
          command: helpers.createNode(NodeType.Text, { content: content.trim(), location: location() }),
          arguments: []
        }],
        commandBases: []
      };
    }

// -------------------------------------------------------------
// COMMAND CONTENT - With variable interpolation
// -------------------------------------------------------------

// Command parts for unified syntax - tokenizes properly
UnifiedCommandParts
  = &{ helpers.debug('UnifiedCommandParts: Starting to parse at position', offset()); return true; }
    tokens:UnifiedCommandToken* {
      helpers.debug('UnifiedCommandParts: Parsed tokens', { count: tokens.length });
      // Flatten any arrays that might come from quoted strings with variables
      const flattened = [];
      for (const token of tokens) {
        if (Array.isArray(token)) {
          flattened.push(...token);
        } else {
          flattened.push(token);
        }
      }
      return flattened;
    }

// Command tokens - complete units (quoted strings, variables, words)
UnifiedCommandToken
  = VariableNoTail               // Variables first (unified pattern)
  / UnifiedCommandQuotedString   // Complete quoted strings
  / UnifiedCommandWord           // Unquoted words with spaces
  / UnifiedCommandSpace          // Explicit spaces between tokens


// (Removed UnifiedCommandText - now using token-based approach)

// Quoted strings in unified commands - preserve special characters inside quotes
UnifiedCommandQuotedString
  = '"' content:UnifiedDoubleQuotedContent* '"' {
      // For double quotes, we need to handle variable interpolation
      // Return an array of nodes that can include both text and variable references
      const nodes = [];
      let currentText = '"';
      
      for (const item of content) {
        if (typeof item === 'string') {
          currentText += item;
        } else if (item.type === NodeType.VariableReference || item.type === 'FileReference') {
          // Flush current text if any
          if (currentText) {
            nodes.push(helpers.createNode(NodeType.Text, { content: currentText, location: location() }));
            currentText = '';
          }
          // Add the variable or file reference
          nodes.push(item);
        }
      }
      
      // Add closing quote and flush remaining text
      currentText += '"';
      if (currentText !== '""') {
        nodes.push(helpers.createNode(NodeType.Text, { content: currentText, location: location() }));
      }
      
      // If only one text node, return it directly
      if (nodes.length === 1 && nodes[0].type === NodeType.Text) {
        return nodes[0];
      }
      
      // Otherwise return array of nodes
      return nodes;
    }
  / "'" content:UnifiedCommandSingleQuotedContent* "'" {
      // Preserve quotes in the output - no variable interpolation in single quotes
      const text = "'" + content.join('') + "'";
      return helpers.createNode(NodeType.Text, { content: text, location: location() });
    }

// Content inside double quotes - allows variables and file references but no operator checks  
UnifiedDoubleQuotedContent
  = varRef:VariableNoTail {
      // Variable interpolation inside double quotes - return the unified pattern result
      return varRef;
    }
  / fileRef:FileReferenceInterpolation {
      // File reference interpolation inside double quotes
      return fileRef;
    }
  / chars:$((!'"' !'@' !'<' .)+) { return chars; }
  / "@" { return '@'; }  // Lone @ without identifier
  / "<" { return '<'; }  // Lone < without file reference

// Content inside single quotes - no variables, no operator checks
UnifiedCommandSingleQuotedContent
  = chars:$(!"'" .)+ { return chars; }

// Unquoted word - apply security checks
UnifiedCommandWord
  = chars:UnifiedCommandWordChar+ {
      const content = chars.join('');
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

// Characters in unquoted words - with security checks
UnifiedCommandWordChar
  = &{ 
      // Security checks for banned operators (only for unquoted content)
      const pos = peg$currPos;
      const ahead = input.substring(pos, pos + 3);
      const char = input[pos];
      const prev = pos > 0 ? input[pos - 1] : null;
      
      // Don't consume quotes - they start new tokens
      if (char === '"' || char === "'") {
        return false;
      }
      
      // Don't consume spaces - they are separate tokens
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        return false;
      }
      
      // Don't consume @ - it starts variables
      if (char === '@') {
        return false;
      }
      
      // Don't consume )] as it ends the command (old syntax)
      if (char === ')' && input[pos + 1] === ']') {
        return false;
      }
      
      // Don't consume closing brace as it ends the command (new syntax)
      if (char === String.fromCharCode(125)) {
        return false;
      }
      
      // Check if this character is escaped
      const isEscaped = prev === '\\';
      
      // Check for banned operators (skip if escaped)
      if (!isEscaped) {
        if (ahead.startsWith('&&')) {
          helpers.mlldError(`Shell operator AND (&&) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
        }
        if (ahead.startsWith('||')) {
          helpers.mlldError(`Shell operator OR (||) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
        }
        if (ahead.startsWith('>>')) {
          helpers.mlldError(`Shell append operator (>>) is not allowed in mlld. Use @output directive for file operations.`);
        }
        if (char === ';') {
          helpers.mlldError(`Shell operator semicolon (;) is not allowed in mlld commands. Use @run sh [(script)] for shell scripts or separate @run commands.`);
        }
        if (char === '>' && input[pos + 1] !== '>') {
          helpers.mlldError(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
        }
        if (char === '<') {
          helpers.mlldError(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
        }
        if (char === '&' && input[pos + 1] !== '&' && input[pos + 1] !== '>') {
          helpers.mlldError(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
        }
      }
      // Note: Single pipe | is allowed for command piping
      
      return true;
    } char:. { return char; }

// Explicit space token
UnifiedCommandSpace
  = spaces:[ \t\n\r]+ {
      return helpers.createNode(NodeType.Text, { content: spaces.join(''), location: location() });
    }

// (Removed old character-based parsing rules - now using token-based approach)

// -------------------------------------------------------------
// CODE CONTENT - Without variable interpolation
// -------------------------------------------------------------

// Code content - everything after language keyword
UnifiedCodeContent
  = chars:UnifiedCodeChar* {
      return chars.join('');
    }

// Code characters - preserve everything literally including nested braces
UnifiedCodeChar
  = '"' chars:DoubleQuoteChar* '"' { return '"' + chars.join('') + '"'; }  // Double quoted strings
  / "'" chars:SingleQuoteChar* "'" { return "'" + chars.join('') + "'"; }  // Single quoted strings
  / '`' chars:BacktickChar* '`' { return '`' + chars.join('') + '`'; }      // Template literals
  / '/*' chars:(!('*/') c:. { return c; })* '*/' { return '/*' + chars.join('') + '*/'; }  // Multi-line comments
  / '//' chars:(!('\n') c:. { return c; })* { return '//' + chars.join(''); }  // Single-line comments
  / '{' inner:UnifiedCodeContent '}' { return '{' + inner + '}'; }          // Nested braces
  / !'}' char:. { return char; }                                            // Any other character

// Characters inside double quotes
DoubleQuoteChar
  = '\\' char:. { return '\\' + char; }  // Escaped characters
  / !'"' char:. { return char; }

// Characters inside single quotes  
SingleQuoteChar
  = '\\' char:. { return '\\' + char; }  // Escaped characters
  / !"'" char:. { return char; }

// Characters inside backticks
BacktickChar
  = '\\' char:. { return '\\' + char; }  // Escaped characters
  / !'`' char:. { return char; }

