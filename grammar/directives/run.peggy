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
  = DirectiveContext "@run" _ security:(SecurityOptions _)? "@" commandRef:RunCommandReference withClause:WithClause? comment:InlineComment? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched command reference', { commandRef, securityOptions, withClause });
      
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
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        meta.withClause = withClause;
      }
      
      // This is used to run a previously defined command (created with @exec)
      return helpers.createStructuredDirective(
        'run',
        'runExec',
        values,
        raw,
        meta,
        location(),
        'exec'  // Source parameter
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? command:CommandCore withClause:WithClause? comment:InlineComment? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched shell command', { command, securityOptions, withClause });
      
      const meta = {
        ...command.meta,
        isMultiLine: command.raw.command.includes('\n'),
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      const values = command.values;
      const raw = command.raw;
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        meta.withClause = withClause;
      }
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        values,
        raw,
        meta,
        location(),
        'command'  // Source parameter
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? runCode:RunLanguageCodeCore withClause:WithClause? comment:InlineComment? {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched language code block using shared abstraction', runCode, securityOptions, withClause);
      
      const meta = {
        ...runCode.meta,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      const values = runCode.values;
      const raw = runCode.raw;
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        meta.withClause = withClause;
      }
      
      // Since we're using the shared abstraction, we just need to format it for this context
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
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

// Command reference structure (for @run @command with field access support)
RunCommandReference
  = identifier:BaseIdentifier fields:AnyFieldAccess* _ args:RunCommandArguments? {
      // Process arguments if present
      const processedArgs = args || [];
      const rawArgs = processedArgs.map(arg => {
        if (arg.type === NodeType.Text) return arg.content;
        if (arg.type === NodeType.VariableReference) return arg.identifier;
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
      return helpers.createNode(NodeType.Text, { content: str, location: location() });
    }
  / varRef:Variable {
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value (raw argument)
      return helpers.createNode(NodeType.Text, { content: val.trim(), location: location() });
    }