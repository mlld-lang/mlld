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
  = "@run" DirectiveContext _ command:CommandCore {
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
        location()
      );
    }
  / "@run" DirectiveContext _ language:RunCodeLanguage _ args:RunCodeArgs? _ code:CodeCore {
      helpers.debug('AtRun matched language code block', { language, args, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
      // Add language and args to values
      const values = {
        lang: [langNode],
        args: args || [],
        ...code.values
      };
      
      // Add language and args to raw representation
      const raw = {
        lang: language,
        args: args ? args.map(arg => arg.identifier || '') : [],
        ...code.raw
      };
      
      // Add metadata
      const meta = {
        ...code.meta,
        isMultiLine: code.raw.code.includes('\n'),
        language: language
      };
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        location()
      );
    }
  / "@run" DirectiveContext _ "@" commandRef:RunCommandReference {
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
        location()
      );
    }

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = "@run" RHSContext _ command:CommandCore {
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
  / "@run" RHSContext _ language:RunCodeLanguage _ code:CodeCore {
      helpers.debug('RunDirectiveRef matched code in RHS', { language, code });
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        {
          lang: [langNode],
          ...code.values
        },
        {
          lang: language,
          ...code.raw
        },
        { 
          ...code.meta,
          isRHSRef: true,
          language: language
        },
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Language identifier for code blocks
RunCodeLanguage
  = language:BaseIdentifier {
      return language;
    }

// Optional arguments for code blocks
RunCodeArgs
  = "(" _ args:RunArgsList? _ ")" {
      return args || [];
    }

RunArgsList
  = first:RunArg rest:(_ "," _ arg:RunArg { return arg; })* {
      return [first, ...rest];
    }

RunArg
  = varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('varInterpolation', { identifier: varName }, location());
    }

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
        identifier: [helpers.createNode(NodeType.Text, { content: identifier }, location())],
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
      return helpers.createNode(NodeType.Text, { content: str }, location());
    }
  / varRef:Variable {
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value (raw argument)
      return helpers.createNode(NodeType.Text, { content: val.trim() }, location());
    }