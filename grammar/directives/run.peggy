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
AtRun
  = DirectiveContext "/run" _ security:(SecurityOptions _)? "\"" command:$([^"]*) "\"" tail:TailModifiers? comment:InlineComment? {
      // Quoted command syntax: /run "echo hello"
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched quoted command', { command, securityOptions, tail });
      
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
      helpers.debug('AtRun matched command', { content, securityOptions, tail });
      
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
      helpers.debug('AtRun matched with language code pattern', { codeCore, securityOptions, tail });
      
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
      helpers.debug('AtRun matched command reference', { commandRef, securityOptions, tail });
      
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
  / varRef:Variable {
      // Return the VariableReference directly
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value - create a Text node directly
      return helpers.createNode(NodeType.Text, { content: val.trim(), location: location() });
    }

