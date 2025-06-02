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

// Primary @run directive - Semantic parsing based on what follows @run
// Order matters: most specific patterns first
AtRun
  = DirectiveContext "@run" _ security:(SecurityOptions _)? lang:RunCodeLanguage _ "[" content:$(CodeLiteralContent) "]" comment:InlineComment? {
      // Language detected -> Code semantics (no interpolation)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched language code block', { lang, content, securityOptions });
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        {
          lang: [helpers.createNode(NodeType.Text, { content: lang, location: location() })],
          args: [],
          code: [helpers.createNode(NodeType.Text, { content, location: location() })]
        },
        {
          lang: lang,
          args: [],
          code: content
        },
        {
          isMultiLine: content.includes('\n'),
          ...helpers.createSecurityMeta(securityOptions),
          ...(comment ? { comment } : {})
        },
        location(),
        'code'
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? "[" parts:RunCommandParts "]" comment:InlineComment? {
      // Bracket detected without language -> Command semantics (with @var interpolation)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched bracketed command', { parts, securityOptions });
      
      const rawCommand = helpers.reconstructRawString(parts);
      
      // Extract command bases from the parts
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
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        {
          command: parts,
          commandBases: commandBases
        },
        {
          command: rawCommand,
          commandBases: rawBases
        },
        {
          isMultiLine: rawCommand.includes('\n'),
          commandCount: commandBases.length,
          hasScriptRunner: false,
          ...helpers.createSecurityMeta(securityOptions),
          ...(comment ? { comment } : {})
        },
        location(),
        'command'
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? "@" commandRef:RunCommandReference comment:InlineComment? {
      // @ detected -> Command reference (exec)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched command reference', { commandRef, securityOptions });
      
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
          ...helpers.createSecurityMeta(securityOptions),
          ...(comment ? { comment } : {})
        },
        location(),
        'exec'
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? runCode:RunLanguageCodeCore comment:InlineComment? {
      // Language with args pattern (delegated to core)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched language code block using shared abstraction', runCode, securityOptions);
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        runCode.values,
        runCode.raw,
        {
          ...runCode.meta,
          ...helpers.createSecurityMeta(securityOptions),
          ...(comment ? { comment } : {})
        },
        runCode.location,
        'code'
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

// Command parts for semantic parsing of bracketed commands
RunCommandParts
  = parts:(RunCommandVariable / RunCommandText)* {
      return parts;
    }

// Variable in command context - no context predicate needed
RunCommandVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable  // Special vars like @., @TIME, etc.

// Text segments in commands - everything that's not a variable
RunCommandText
  = chars:$((!']' !'@' .)+) {
      return helpers.createNode(NodeType.Text, { content: chars, location: location() });
    }