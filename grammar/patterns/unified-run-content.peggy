// UNIFIED RUN CONTENT PATTERN
// Handles the new [(...))] syntax for both commands and code

/* 
# Unified Run Content

The [(...))] syntax unifies command and code execution:
- @run [(echo "hello")]        - Command (no language keyword)
- @run [(js console.log(42))]  - Code (starts with language keyword)

This pattern detects the content type and applies appropriate parsing rules.
*/

// -------------------------------------------------------------
// UNIFIED CONTENT PATTERN - Single entry point for [(...)]
// -------------------------------------------------------------

// UNIFIED CODE BRACKETS - Parses [(code)] for language-specific code
// Used by: AtRun directive when language is specified
// Purpose: Parse code content without language detection
UnifiedCodeBrackets "Code brackets [(...))]"
  = "[(" _ content:$(UnifiedCodeContent) _ ")]" {
      helpers.debug('UnifiedCodeBrackets matched', { content });
      return {
        content: content.trim(),
        isMultiLine: content.includes('\n')
      };
    }

// UNIFIED COMMAND BRACKETS - Parses [(command)] for shell commands
// Used by: AtRun directive when no language is specified  
// Purpose: Parse command content with variable interpolation and security checks
UnifiedCommandBrackets "Command brackets [(...))]"
  = "[(" _ parts:UnifiedCommandParts _ ")]" {
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
  = content:$([^)]*) {
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
            error(`Shell operator AND (&&) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
          } else if (char === '|' && next === '|') {
            error(`Shell operator OR (||) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
          } else if (char === ';') {
            error(`Shell operator semicolon (;) is not allowed in mlld. Use separate @run commands.`);
          } else if (char === '>' && next === '>') {
            error(`Shell append operator (>>) is not allowed in mlld. Use @output directive for file operations.`);
          } else if (char === '>' || char === '<') {
            error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
          } else if (char === '&' && next !== '&' && next !== '>') {
            error(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
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

// Command parts for unified syntax - allows @var interpolation
UnifiedCommandParts
  = parts:(UnifiedCommandVariable / UnifiedCommandText)* {
      return parts;
    }

// Variable in unified command context
UnifiedCommandVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable

// Text segments in unified commands - handle nested brackets
UnifiedCommandText
  = chars:UnifiedCommandChar+ {
      const content = chars.join('');
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

// Characters in unified commands - handle nested brackets  
UnifiedCommandChar
  = '[' inner:UnifiedCommandInnerContent ']' {
      // Preserve brackets in commands
      return '[' + inner + ']';
    }
  / &{ 
      // Security checks for banned operators
      const pos = peg$currPos;
      const ahead = input.substring(pos, pos + 3);
      if (ahead.startsWith('&&')) {
        error(`Shell operator AND (&&) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
      }
      if (ahead.startsWith('||')) {
        error(`Shell operator OR (||) is not allowed in mlld. Use separate @run commands or @when for control flow.`);
      }
      if (ahead.startsWith('>>')) {
        error(`Shell append operator (>>) is not allowed in mlld. Use @output directive for file operations.`);
      }
      if (ahead.startsWith(';&')) {
        error(`Shell operator semicolon (;) is not allowed in mlld. Use separate @run commands.`);
      }
      // Check for single character operators
      const char = input[pos];
      if (char === ';') {
        error(`Shell operator semicolon (;) is not allowed in mlld. Use separate @run commands.`);
      }
      if (char === '>' && input[pos + 1] !== '>') {
        error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
      }
      if (char === '<') {
        error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
      }
      if (char === '&' && input[pos + 1] !== '&' && input[pos + 1] !== '>') {
        error(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
      }
      return true;
    } !'@' !')]' char:. { return char; }

// Inner content of nested brackets
UnifiedCommandInnerContent
  = chars:UnifiedCommandInnerChar* {
      return chars.join('');
    }

// Characters inside nested brackets
UnifiedCommandInnerChar
  = '[' inner:UnifiedCommandInnerContent ']' {
      // Handle deeply nested brackets
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }

// -------------------------------------------------------------
// CODE CONTENT - Without variable interpolation
// -------------------------------------------------------------

// Code content - everything after language keyword
UnifiedCodeContent
  = chars:UnifiedCodeChar* {
      return chars.join('');
    }

// Code characters - preserve everything literally
UnifiedCodeChar
  = '[' inner:UnifiedCodeInnerContent ']' {
      // Preserve brackets in code
      return '[' + inner + ']';
    }
  / !')]' char:. { return char; }

// Inner content for code brackets
UnifiedCodeInnerContent
  = chars:UnifiedCodeInnerChar* {
      return chars.join('');
    }

// Characters inside code brackets
UnifiedCodeInnerChar
  = '[' inner:UnifiedCodeInnerContent ']' {
      // Handle deeply nested brackets
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }