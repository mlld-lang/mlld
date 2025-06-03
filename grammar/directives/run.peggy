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
  = DirectiveContext "@run" _ security:(SecurityOptions _)? lang:RunCodeLanguage _ "[" content:$(CodeLiteralContent) "]" withClause:WithClause? comment:InlineComment? {
      // Language detected -> Code semantics (no interpolation)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched language code block', { lang, content, securityOptions, withClause });
      
      const values = {
        lang: [helpers.createNode(NodeType.Text, { content: lang, location: location() })],
        args: [],
        code: [helpers.createNode(NodeType.Text, { content, location: location() })]
      };
      
      const raw = {
        lang: lang,
        args: [],
        code: content
      };
      
      const meta = {
        isMultiLine: content.includes('\n'),
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        meta.withClause = withClause;
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
  / DirectiveContext "@run" _ security:(SecurityOptions _)? "[" parts:RunCommandParts "]" withClause:WithClause? comment:InlineComment? {
      // Bracket detected without language -> Command semantics (with @var interpolation)
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched bracketed command', { parts, securityOptions, withClause });
      
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
      
      const values = {
        command: parts,
        commandBases: commandBases
      };
      
      const raw = {
        command: rawCommand,
        commandBases: rawBases
      };
      
      const meta = {
        isMultiLine: rawCommand.includes('\n'),
        commandCount: commandBases.length,
        hasScriptRunner: false,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
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
        'command'
      );
    }
  / DirectiveContext "@run" _ security:(SecurityOptions _)? "@" commandRef:RunCommandReference withClause:WithClause? comment:InlineComment? {
      // @ detected -> Command reference (exec)
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
  / DirectiveContext "@run" _ security:(SecurityOptions _)? runCode:RunLanguageCodeCore withClause:WithClause? comment:InlineComment? {
      // Language with args pattern (delegated to core)
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
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        runCode.location,
        'code'
      );
    }

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = lang:RunCodeLanguage _ "[" content:$(CodeLiteralContent) "]" {
      helpers.debug('RunDirectiveRef matched language code in RHS', { lang, content });
      
      // Handle language + code pattern
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
          language: lang,
          hasVariables: false,
          isRHSRef: true
        },
        location()
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

// Text segments in commands - handle nested brackets
RunCommandText
  = chars:RunCommandChar+ {
      const content = chars.join('');
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

// Characters in commands - handle nested brackets
RunCommandChar
  = '[' inner:RunCommandInnerContent ']' {
      // Preserve brackets in commands
      return '[' + inner + ']';
    }
  / !'@' !']' char:. { return char; }

// Inner content of nested brackets
RunCommandInnerContent
  = chars:RunCommandInnerChar* {
      return chars.join('');
    }

// Characters inside nested brackets
RunCommandInnerChar  
  = '[' inner:RunCommandInnerContent ']' {
      // Handle deeply nested brackets
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }