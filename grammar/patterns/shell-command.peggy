// SHELL COMMAND PARSER
// Simplified shell command parsing with pipe and operator support

/* 
# Shell Command Parser

This is a simplified shell command parser that handles:
- Simple commands with arguments
- Piped commands (|)
- Command chaining (&&, ||, ;)
- Quoted strings
- Variable references (@var)

This is NOT a full shell parser - just enough for Mlld's needs.
*/

// -------------------------------------------------------------
// MAIN COMMAND PARSER
// -------------------------------------------------------------

// Parse a complete shell command line
ShellCommandLine
  = pipeline:Pipeline {
      // Only single pipeline allowed - no chaining with &&, ||, ;
      // Build command structure
      const allCommands = [];
      const allBases = [];
      
      // Process pipeline
      pipeline.commands.forEach(cmd => {
        allCommands.push(cmd);
        if (cmd.base) {
          allBases.push(cmd.base);
        }
      });
      
      return {
        commands: allCommands,
        commandBases: allBases
      };
    }

// Chain operators (command separators) - BANNED for security
ChainOperator
  = op:("&&" / "||" / ";") {
      // These operators are banned in mlld for security reasons
      // Use separate @run commands or @when for control flow
      const opName = op === '&&' ? 'AND (&&)' : 
                     op === '||' ? 'OR (||)' : 
                     'semicolon (;)';
      error(`Shell operator ${opName} is not allowed in mlld. Use separate @run commands or @when for control flow.`);
    }

// Redirection operators - BANNED for security
RedirectionOperator
  = op:(">>" / ">" / "<" / "&>") {
      // Redirection operators are banned in mlld for security reasons
      // Use @output directive for file writing
      const opName = op === '>>' ? 'append (>>)' : 
                     op === '>' ? 'redirect (>)' : 
                     op === '<' ? 'input (<)' :
                     'error redirect (&>)';
      error(`Shell ${opName} operator is not allowed in mlld. Use @output directive for file operations.`);
    }

// Background operator - BANNED for security  
BackgroundOperator
  = "&" ![&>] {
      // Background execution is banned in mlld
      error(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
    }

// -------------------------------------------------------------
// PIPELINE PARSER
// -------------------------------------------------------------

// Parse a pipeline (commands connected by |)
Pipeline
  = first:ShellSimpleCommand rest:(_ "|" _ cmd:ShellSimpleCommand { return cmd; })* {
      const commands = [first];
      
      if (rest.length > 0) {
        // Add pipe operators between commands
        rest.forEach((cmd, i) => {
          commands.push({ type: 'operator', operator: '|' });
          commands.push(cmd);
        });
      }
      
      return { commands };
    }

// -------------------------------------------------------------
// SIMPLE COMMAND PARSER
// -------------------------------------------------------------

// Parse a simple command with arguments
ShellSimpleCommand
  = cmd:ShellCommandName args:(_ arg:ShellCommandArgument { return arg; })* {
      // Detect command base patterns
      const cmdText = cmd.content || cmd.identifier || '';
      let base = null;
      let hasScriptRunner = false;
      
      // Check for script runner patterns
      if (args.length >= 1 && ['npm', 'yarn', 'pnpm', 'bun'].includes(cmdText)) {
        const firstArg = args[0];
        if (firstArg.type === 'Text' && firstArg.content === 'run' && args[1]) {
          // Script runner detected
          const script = args[1].type === 'Text' ? args[1].content : args[1].identifier;
          base = helpers.createNode(NodeType.CommandBase, {
            command: cmdText + ' run',
            script: script,
            isScriptRunner: true,
            location: cmd.location
          });
          hasScriptRunner = true;
        }
      } else if (cmdText === 'npx' && args[0]) {
        // npx pattern
        const pkg = args[0].type === 'Text' ? args[0].content : args[0].identifier;
        base = helpers.createNode(NodeType.CommandBase, {
          command: 'npx',
          package: pkg,
          isPackageRunner: true,
          location: cmd.location
        });
      } else if (cmdText === 'python' && args[0]?.content === '-m' && args[1]) {
        // python -m pattern
        const mod = args[1].type === 'Text' ? args[1].content : args[1].identifier;
        base = helpers.createNode(NodeType.CommandBase, {
          command: 'python -m',
          module: mod,
          location: cmd.location
        });
      } else {
        // Regular command
        base = helpers.createNode(NodeType.CommandBase, {
          command: cmdText,
          location: cmd.location
        });
      }
      
      return {
        type: 'command',
        command: cmd,
        arguments: args,
        base: base,
        hasScriptRunner: hasScriptRunner
      };
    }

// Command name (first word)
ShellCommandName
  = ShellVariable
  / word:UnquotedWord {
      return helpers.createNode(NodeType.Text, { 
        content: word, 
        location: location() 
      });
    }

// Command argument
ShellCommandArgument
  = &{ 
      // Check ahead for banned operators
      const ahead = input.substring(peg$currPos, peg$currPos + 3);
      if (ahead.startsWith('&&') || ahead.startsWith('||')) {
        error(`Shell operators are not allowed in mlld. Use separate @run commands or @when for control flow.`);
      }
      if (ahead.startsWith('>>') || ahead.startsWith('>&')) {
        error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
      }
      if (ahead.startsWith(';')) {
        error(`Shell operator semicolon (;) is not allowed in mlld. Use separate @run commands.`);
      }
      // Check for single character operators
      const char = input[peg$currPos];
      if (char === '>' || char === '<') {
        error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
      }
      if (char === '&' && input[peg$currPos + 1] !== '&' && input[peg$currPos + 1] !== '>') {
        error(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
      }
      return true;
    } arg:(QuotedString / ShellVariable / UnquotedWordWithCheck) {
      return arg;
    }

// Unquoted word with operator check
UnquotedWordWithCheck
  = word:UnquotedWord {
      return helpers.createNode(NodeType.Text, { 
        content: word, 
        location: location() 
      });
    }

// -------------------------------------------------------------
// SHELL TOKENS
// -------------------------------------------------------------

// Variable reference
ShellVariable
  = "@" id:BaseIdentifier {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        location: location()
      });
    }

// Quoted string (preserves spaces)
QuotedString
  = '"' content:DoubleQuotedContent* '"' {
      const text = content.map(c => c.content || c.identifier || c).join('');
      return helpers.createNode(NodeType.Text, { 
        content: text, 
        location: location() 
      });
    }
  / "'" content:SingleQuotedContent* "'" {
      const text = content.join('');
      return helpers.createNode(NodeType.Text, { 
        content: text, 
        location: location() 
      });
    }

// Double quoted content (allows variables)
DoubleQuotedContent
  = ShellVariable
  / chars:$([^"@]+) { return { content: chars }; }

// Single quoted content (no variables)
SingleQuotedContent
  = chars:$([^']+) { return chars; }

// Unquoted word (no spaces or special chars)
UnquotedWord
  = word:$([^@|&;<> \t\n\r"']+) {
      // Check for banned operators that might appear as part of a word
      if (word.includes('&&') || word.includes('||')) {
        error(`Shell operators are not allowed in mlld. Use separate @run commands or @when for control flow.`);
      }
      if (word.includes('>>') || (word.includes('>') && !word.includes('>&'))) {
        error(`Shell redirection operators are not allowed in mlld. Use @output directive for file operations.`);
      }
      return word;
    }