// RUN DIRECTIVE
// Implementation of the @run directive for executing commands and code

/* 
# Run Directive

The run directive executes shell commands, code blocks, or references to exec-defined variables.
It can be used in three main forms:
1. @run command-string        - Execute a shell command
2. @run language [code-block] - Execute a code block in the specified language
3. @run @commandVariable      - Execute a previously defined command/code reference
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL RUN DIRECTIVE
// -------------------------------------------------------------

// Primary @run directive 
AtRun
  = DirectiveContext "@run" _ "@" commandRef:RunCommandReference {
      helpers.debug('AtRun matched command reference', { commandRef });
      
      // This is used to run a previously defined command (created with @exec)
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
          argumentCount: commandRef.args ? commandRef.args.length : 0
        },
        location(),
        'exec'  // Source parameter
      );
    }
  / DirectiveContext "@run" _ command:CommandCore {
      helpers.debug('AtRun matched shell command', { command });
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        {
          ...command.meta,
          isMultiLine: command.raw.command.includes('\n')
        },
        location(),
        'command'  // Source parameter
      );
    }
  / DirectiveContext "@run" _ runCode:RunLanguageCodeCore {
      helpers.debug('AtRun matched language code block using shared abstraction', runCode);
      
      // Since we're using the shared abstraction, we just need to format it for this context
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        runCode.values,
        runCode.raw,
        runCode.meta,
        runCode.location,
        'code'  // Source parameter
      );
    }

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = RunCodeBlockContext runCode:RunLanguageCodeCore {
      helpers.debug('RunDirectiveRef matched code in RHS using shared abstraction', runCode);
      
      // Use the shared abstraction but add RHS-specific metadata
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        runCode.values,
        runCode.raw,
        { 
          ...runCode.meta,
          isRHSRef: true
        },
        runCode.location
      );
    }
  / command:CommandCore {
      helpers.debug('RunDirectiveRef matched in RHS', { command });
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        { 
          ...command.meta, 
          isRHSRef: true,
          isMultiLine: command.raw.command.includes('\n')
        },
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Command reference structure (for @run @command)
RunCommandReference
  = identifier:BaseIdentifier _ args:RunCommandArgs? {
      // Process arguments if present
      const processedArgs = args || [];
      const rawArgs = processedArgs.map(arg => {
        if (arg.type === NodeType.Text) return arg.content;
        if (arg.type === NodeType.VariableReference) return arg.identifier;
        return '';
      });
      
      return {
        identifier: [helpers.createNode(NodeType.Text, { content: identifier, location: location() })],
        rawIdentifier: identifier,
        args: processedArgs,
        rawArgs: rawArgs
      };
    }

// Arguments for command references
RunCommandArgs
  = "(" _ args:RunCommandArgsList? _ ")" {
      return args || [];
    }

RunCommandArgsList
  = first:RunCommandArg rest:(_ "," _ arg:RunCommandArg { return arg; })* {
      return [first, ...rest];
    }

RunCommandArg
  = str:StringLiteral {
      return helpers.createNode(NodeType.Text, { content: str, location: location() });
    }
  / varRef:Variable {
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value (raw argument)
      return helpers.createNode(NodeType.Text, { content: val.trim(), location: location() });
    }