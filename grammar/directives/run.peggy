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

// Primary @run directive - Supporting both command and code syntax
// Order matters: most specific patterns first
AtRun
  = DirectiveContext "@run" _ security:(SecurityOptions _)? lang:RunCodeLanguage _ args:RunCodeArguments? _ code:UnifiedCodeBrackets withClause:WithClause? comment:InlineComment? {
      // Language + code syntax: @run language [(code)]
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched language + code', { lang, code, securityOptions, withClause });
      
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: code.content, location: location() });
      
      const values = {
        lang: [langNode],
        args: args || [],
        code: [codeNode]
      };
      
      const raw = {
        lang: lang,
        args: args ? args.map(arg => arg.identifier || '') : [],
        code: code.content
      };
      
      const meta = {
        isMultiLine: code.isMultiLine || code.content.includes('\n'),
        language: lang,
        hasVariables: false, // Code blocks don't support variable interpolation
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
  / DirectiveContext "@run" _ security:(SecurityOptions _)? content:UnifiedCommandBrackets withClause:WithClause? comment:InlineComment? {
      // Command syntax: @run [(command)]
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtRun matched command', { content, securityOptions, withClause });
      
      const meta = {
        ...content.meta,
        ...helpers.createSecurityMeta(securityOptions),
        ...(comment ? { comment } : {})
      };
      
      const values = content.values;
      const raw = content.raw;
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        meta.withClause = withClause;
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

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = lang:RunCodeLanguage _ args:RunCodeArguments? _ code:UnifiedCodeBrackets {
      // Language + code syntax in RHS: language [(code)]
      helpers.debug('RunDirectiveRef matched language + code in RHS', { lang, code });
      
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: code.content, location: location() });
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        {
          lang: [langNode],
          args: args || [],
          code: [codeNode]
        },
        {
          lang: lang,
          args: args ? args.map(arg => arg.identifier || '') : [],
          code: code.content
        },
        { 
          isMultiLine: code.isMultiLine || code.content.includes('\n'),
          language: lang,
          hasVariables: false,
          isRHSRef: true
        },
        location()
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

