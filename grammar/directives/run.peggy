// RUN DIRECTIVE
// Implementation of the /run directive for executing commands and code

/* 
# Run Directive

The run directive executes shell commands, code blocks, or references to exec-defined variables.
It can be used in three main forms:
1. /run command-string        - Execute a shell command
2. /run language [code-block] - Execute a code block in the specified language
3. /run @commandVariable      - Execute a previously defined command/code reference
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL RUN DIRECTIVE
// -------------------------------------------------------------

// Primary /run directive - Supporting both command and code syntax
// Order matters: most specific patterns first
SlashRun
  = DirectiveContext "/run" _ security:(SecurityOptions _)? "\"" command:$([^"]*) "\"" tail:TailModifiers? comment:InlineComment? {
      // Quoted command syntax: /run "echo hello"
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashRun matched quoted command', { command, securityOptions, tail });
      
      // Parse the command string to extract parts
      const parts = helpers.parseCommandContent(command);
      
      // Extract command base
      let commandBases = [];
      let rawBases = [];
      
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: location()
          }));
          rawBases.push(cmdMatch[1]);
        }
      }
      
      const meta = {
        isMultiLine: false,
        commandCount: commandBases.length,
        hasScriptRunner: false,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      const values = {
        command: parts,
        commandBases: commandBases
      };
      
      const raw = {
        command: command,
        commandBases: rawBases
      };
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        values,
        raw,
        meta,
        location(),
        'command'
      );
    }
  / DirectiveContext "/run" _ security:(SecurityOptions _)? content:UnifiedCommandBrackets tail:TailModifiers? comment:InlineComment? {
      // Command syntax: /run {command}
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashRun matched command', { content, securityOptions, tail });
      
      const meta = {
        ...content.meta,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      const values = content.values;
      const raw = content.raw;
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'run',
        content.subtype,
        values,
        raw,
        meta,
        location(),
        content.type
      );
    }
  / DirectiveContext "/run" _ security:(SecurityOptions _)? codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) tail:TailModifiers? comment:InlineComment? {
      // Language + code syntax: /run language {code} or /run language (args) {code}
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashRun matched with language code pattern', { codeCore, securityOptions, tail });
      
      // Use values and raw from the core pattern
      const values = codeCore.values;
      const raw = codeCore.raw;
      
      // Merge metadata
      const meta = {
        ...codeCore.meta,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        location(),
        'code'
      );
    }
  / DirectiveContext "/run" _ security:(SecurityOptions _)? "@" commandRef:RunCommandReference tail:TailModifiers? comment:InlineComment? {
      // @ detected -> Command reference (exec)
      const securityOptions = security ? security[0] : null;
      helpers.debug('SlashRun matched command reference', { commandRef, securityOptions, tail });
      
      const values = {
        identifier: commandRef.identifier,
        args: commandRef.args || []
      };
      
      const raw = {
        identifier: commandRef.rawIdentifier,
        args: commandRef.rawArgs || []
      };
      
      const meta = {
        argumentCount: commandRef.args ? commandRef.args.length : 0,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'run',
        'runExec',
        values,
        raw,
        meta,
        location(),
        'exec'
      );
    }
    
  // Error Recovery Rules for /run directive
  // ----------------------------------------
  
  // Error: Unclosed quoted command
  / DirectiveContext "/run" _ "\"" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed quoted command in /run directive. Expected closing double quote (\").", "\"", location());
    }
    
  // Error: Unclosed bracket command
  / DirectiveContext "/run" _ "{" &{
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed command brackets in /run directive. Expected closing brace for command.", String.fromCharCode(125), location());
    }
    
  // Error: Invalid syntax after language identifier - must check for NOT { or (
  / DirectiveContext "/run" _ lang:BaseIdentifier _ !"{" !"(" !LineTerminator !EOF &{
      // Only match if this is a valid language identifier
      const validLangs = ['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh'];
      return validLangs.includes(lang.toLowerCase());
    } {
      helpers.mlldError("Invalid code syntax in /run directive. Expected code block or arguments after language identifier: " + lang, String.fromCharCode(123), location());
    }
    
  // Error: Missing code block after language
  / DirectiveContext "/run" _ lang:BaseIdentifier _ &(LineTerminator / EOF) &{
      const validLangs = ['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh'];
      return validLangs.includes(lang.toLowerCase());
    } {
      helpers.mlldError("Missing code block in /run directive. Expected code block after language: " + lang, String.fromCharCode(123), location());
    }
    
  // Error: Invalid @ usage (not followed by valid identifier)
  / DirectiveContext "/run" _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid exec reference in /run directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Missing content after /run
  / DirectiveContext "/run" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /run directive. Expected command, code block, or exec reference.", String.fromCharCode(123), location());
    }
    
  // Error: Unclosed code block
  / DirectiveContext "/run" _ lang:BaseIdentifier _ "(" [^)]* ")" _ "{" &{
      // Check if we have an unclosed code block after language (args)
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed code block in /run directive. Expected closing brace for " + lang + " code.", String.fromCharCode(125), location());
    }
    
  // Error: Unclosed code block without args
  / DirectiveContext "/run" _ lang:BaseIdentifier _ "{" &{
      // Check if we have an unclosed code block after language
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed code block in /run directive. Expected closing brace for " + lang + " code.", String.fromCharCode(125), location());
    }
    
  // Error: Generic /run syntax error (catch-all)
  / DirectiveContext "/run" {
      helpers.mlldError("Invalid /run syntax. Expected: /run \"command\", /run {command}, /run language {code}, or /run @exec", String.fromCharCode(123));
    }

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) {
      // Language + code syntax in RHS: language {code} or language (args) {code}
      helpers.debug('RunDirectiveRef matched language + code in RHS', { codeCore });
      
      // Use values and raw from the core pattern
      const values = codeCore.values;
      const raw = codeCore.raw;
      
      // Merge metadata
      const meta = {
        ...codeCore.meta,
        isRHSRef: true
      };
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        location(),
        'code'
      );
    }
  / "@" commandRef:RunCommandReference {
      // @ detected -> Command reference (exec) in RHS
      helpers.debug('RunDirectiveRef matched exec reference in RHS', { commandRef });
      
      return helpers.createStructuredDirective(
        'run',
        'runExec',
        {
          identifier: commandRef.identifier,
          args: commandRef.args || []
        },
        {
          identifier: commandRef.rawIdentifier,
          args: commandRef.rawArgs || []
        },
        {
          argumentCount: commandRef.args ? commandRef.args.length : 0,
          isRHSRef: true
        },
        location(),
        'exec'
      );
    }
  / content:UnifiedCommandBrackets {
      helpers.debug('RunDirectiveRef matched command in RHS', { content });
      
      return helpers.createStructuredDirective(
        'run',
        content.subtype,
        content.values,
        content.raw,
        { 
          ...content.meta,
          isRHSRef: true
        },
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Command reference structure (for /run @command with field access support)
RunCommandReference
  = identifier:BaseIdentifier fields:AnyFieldAccess* _ args:RunCommandArguments? {
      // Process arguments if present
      const processedArgs = args || [];
      const rawArgs = processedArgs.map(arg => {
        // Handle Argument nodes
        if (arg.type === NodeType.Argument && arg.value) {
          if (arg.value.type === NodeType.Text) return arg.value.content;
          if (arg.value.type === NodeType.VariableReference) return '@' + arg.value.identifier;
        }
        // Legacy handling for unwrapped nodes (shouldn't happen with new grammar)
        if (arg.type === NodeType.Text) return arg.content;
        if (arg.type === NodeType.VariableReference) return '@' + arg.identifier;
        return '';
      });
      
      // Create a variable reference node with field access support
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: identifier,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      return {
        identifier: [varRef],
        rawIdentifier: identifier,
        fields: fields,
        args: processedArgs,
        rawArgs: rawArgs
      };
    }

// Arguments for command references
RunCommandArguments
  = "(" _ args:RunCommandArgumentList? _ ")" {
      return args || [];
    }

// Using standard list pattern from patterns/lists.peggy
RunCommandArgumentList
  = first:RunCommandArgument rest:(CommaSpace arg:RunCommandArgument { return arg; })* {
      return [first, ...rest];
    }

RunCommandArgument
  = str:StringLiteral {
      // Create a Text node directly
      return helpers.createNode(NodeType.Text, { content: str, location: location() });
    }
  / varRef:SpecialVariable {
      // Special variables like @INPUT work without context
      return varRef;
    }
  / "@" id:BaseIdentifier fields:AnyFieldAccess* {
      // Direct variable reference without context check for arguments
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / val:$([^,)]+) {
      // Plain value - create a Text node directly
      return helpers.createNode(NodeType.Text, { content: val.trim(), location: location() });
    }

