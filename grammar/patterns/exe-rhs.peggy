// EXE RHS CONTENT - Unified right-hand side for /exe directive
// Used by: /exe directive  
// Purpose: Route to appropriate content parser based on syntax detection

ExeRHSContent "exe assignment value"
  = leading:LeadingParallelPipeline {
      const pipeline = leading.withClause.pipeline || [];
      const pipelineSummary = pipeline.map(stage => {
        if (Array.isArray(stage)) {
          return `[${stage.map(cmd => `@${cmd.rawIdentifier}`).join(', ')}]`;
        }
        return `@${stage.rawIdentifier}`;
      }).join(' | ');
      return {
        type: 'exePipelineLeading',
        subtype: 'exeCommand',
        source: 'pipeline',
        values: {
          withClause: leading.withClause
        },
        raw: {
          pipeline: pipelineSummary
        },
        meta: {
          hasPipeline: true,
          isPipelineOnly: true,
          pipelineSource: 'leadingParallel'
        }
      };
    }
  / WhenExpression              // when: [...] expressions for conditional execution
  / ForExpressionExe            // for @var in @collection => action (exe-specific with directive support)
  / ExeForeachPattern           // foreach @command(@arrays) as executable body
  / ExeRunCommandWithStdin      // run {command} with { stdin: @var } - explicit run with stdin
  / ExeRunCommandPipeStdin      // run @var | {command} - pipe sugar stdin syntax
  / ExeStreamCommandPattern     // stream cmd {command} - streaming shell command with optional tail
  / ExeRunCommandPattern        // run {command} - explicit run command syntax
  / ExeCodePattern              // js {code} - language-specific code blocks
  / ExeEnvironmentDeclaration   // { helper1, helper2 } - environment setup (must come before command)
  / ExeDataPattern              // { data } - structured data literal for exec
  / ExeCommandPattern           // cmd {command} - shell commands with interpolation
  / ExeTemplateFromFilePattern  // template "path" - external template file
  / ExeTemplatePattern          // [[...]] and `...` - inline template executables
  / ExeSectionPattern           // [@file # section] - section extraction
  / ExeStatementBlock           // [ ... ] - statement block for exe definitions
  / ExeResolverPattern          // @resolver/path - resolver patterns
  / ExeUnifiedReference         // @func(args) and @otherCmd - unified reference with pipeline support

// -------------------------------------------------------------
// EXE-SPECIFIC RHS PATTERNS
// -------------------------------------------------------------

// Unified reference pattern for exe context - handles @func(args), @var, and pipelines
ExeUnifiedReference "exe unified reference"
  = invocation:UnifiedReferenceWithTail {
      helpers.debug('ExeUnifiedReference matched', { invocation });
      
      // Handle ExecInvocation type (function calls with optional pipeline)
      if (invocation.type === 'ExecInvocation') {
        return {
          type: 'exeExecInvocation',
          values: {
            commandRef: invocation.commandRef,
            args: invocation.commandRef.args || [],
            ...(invocation.withClause ? { withClause: invocation.withClause } : {})
          },
          raw: {
            commandRef: invocation.commandRef.name,
            args: (invocation.commandRef.args || []).map(arg => 
              arg.type === 'Text' ? arg.content : 
              arg.type === 'VariableReference' ? '@' + arg.identifier : ''
            ),
            ...(invocation.withClause?.pipeline ? {
              pipeline: invocation.withClause.pipeline.map(cmd => 
                `@${cmd.rawIdentifier || cmd.name || cmd}`
              ).join(' | ')
            } : {})
          },
          meta: {
            isExecInvocation: true,
            parameterCount: (invocation.commandRef.args || []).length,
            hasPipeline: !!(invocation.withClause?.pipeline)
          },
          subtype: 'exeCommand',
          source: 'invocation'
        };
      }
      
      // Handle VariableReferenceWithTail type (variable with optional pipeline)
      if (invocation.type === 'VariableReferenceWithTail') {
        const variable = invocation.variable;
        const withClause = invocation.withClause;
        
        return {
          type: 'exeCommandRef',
          values: {
            commandRef: [variable],
            ...(withClause ? { withClause } : {})
          },
          raw: {
            commandRef: variable.identifier,
            ...(withClause?.pipeline ? {
              pipeline: withClause.pipeline.map(cmd => 
                `@${cmd.rawIdentifier || cmd.name || cmd}`
              ).join(' | ')
            } : {})
          },
          meta: {
            isCommandRef: true,
            hasPipeline: !!(withClause?.pipeline)
          },
          subtype: 'exeCommand',
          source: 'reference'
        };
      }
      
      // Handle plain VariableReference (no tail modifiers)
      return {
        type: 'exeCommandRef',
        values: {
          commandRef: [invocation]
        },
        raw: {
          commandRef: invocation.identifier
        },
        meta: {
          isCommandRef: true
        },
        subtype: 'exeCommand',
        source: 'reference'
      };
    }

// Run command with stdin pattern for exe context
// In 'run' contexts: supports both "run cmd {...}" and "run {...}" (bare brackets for backward compatibility)
ExeRunCommandWithStdin "exe run command with stdin"
  = "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) _ withClause:WithClause {
      // Only allow with clauses that have stdin
      if (!withClause || !('stdin' in withClause)) {
        return null; // Let other patterns handle this
      }

      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values,
          withClause: withClause
        },
        raw: {
          ...content.raw,
          withClause: withClause
        },
        meta: {
          ...content.meta,
          hasStdin: true
        }
      };
    }

// Run command pipe stdin pattern for exe context
// In 'run' contexts: supports both "run cmd {...}" and "run {...}" (bare brackets for backward compatibility)
ExeRunCommandPipeStdin "exe run command pipe stdin"
  = "run" _ stdinExpr:PipeStdinExpression _ "|" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? {
      const withClause = { stdin: stdinExpr };
      if (tail) {
        Object.assign(withClause, tail);
      }
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values,
          withClause
        },
        raw: {
          ...content.raw,
          stdinExpr: stdinExpr.type === 'VariableReference' ? '@' + stdinExpr.identifier : 'expression',
          ...(tail ? { tailModifiers: tail } : {})
        },
        meta: {
          ...content.meta,
          hasStdin: true,
          isPipeSugar: true,
          hasTailModifiers: !!tail
        }
      };
  }

// Streaming command pattern for exe context - handles "stream cmd {command}" syntax
ExeStreamCommandPattern "exe stream command pattern"
  = "stream" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? {
      const withClause = { stream: true };
      if (tail) {
        Object.assign(withClause, tail);
      }
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values,
          withClause
        },
        raw: {
          ...content.raw,
          ...(tail ? { tailModifiers: tail } : {}),
          stream: true
        },
        meta: {
          ...content.meta,
          hasTailModifiers: !!tail,
          isStream: true
        }
      };
    }

// Run command pattern for exe context
// In 'run' contexts: supports both "run cmd {...}" and "run {...}" (bare brackets for backward compatibility)
ExeRunCommandPattern "exe run command pattern"
  = "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) {
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values
        },
        raw: {
          ...content.raw
        },
        meta: content.meta
      };
    }

// Code pattern for exe context - wraps RunLanguageCodeCore
ExeCodePattern "exe code pattern"
  = codeCore:RunLanguageCodeCore {
      return {
        subtype: 'exeCode',
        source: 'code',
        values: {
          ...codeCore.values
        },
        raw: {
          ...codeCore.raw
        },
        meta: codeCore.meta
      };
    }

// Command pattern for exe context - wraps UnifiedCommandBrackets
ExeCommandPattern "exe command pattern"
  = content:CmdCommandBrackets {
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values
        },
        raw: {
          ...content.raw
        },
        meta: content.meta
      };
    }
  / InvalidBareCommandBrackets

// Data pattern for exe context - structured literal
ExeDataPattern "exe data pattern"
  = dataObj:DataObjectLiteral {
      return {
        subtype: 'exeData',
        source: 'data',
        values: {
          data: dataObj
        },
        raw: {
          data: text()
        },
        meta: {
          inferredType: 'object'
        }
      };
    }

// Template pattern for exe context - wraps TemplateCore
ExeTemplatePattern "exe template pattern"
  = template:TemplateCore {
      return {
        subtype: 'exeTemplate',
        source: 'template',
        values: {
          template: template.values.content
        },
        raw: {
          template: template.raw.content
        },
        meta: template.meta
      };
    }

// Template-from-file pattern for exe context - handles: template "path/to/file.att"
ExeTemplateFromFilePattern "exe template-from-file pattern"
  = "template" _ path:QuotedStringPath {
      return {
        subtype: 'exeTemplateFile',
        source: 'templateFile',
        values: {
          path: path.values.path
        },
        raw: {
          path: path.raw.path
        },
        meta: {
          pathMeta: path.meta
        }
      };
    }

// Section pattern for exe context - handles [@file # section] [as @newheader]
ExeSectionPattern "exe section pattern"
  = "[" _ pathVar:UnifiedVariableNoTail _ "#" _ section:SectionIdentifier _ "]" rename:ExecAsNewTitle? {
      return {
        type: 'exeSection',
        values: {
          path: [pathVar],
          section: Array.isArray(section) ? section : [section],
          ...(rename ? { rename: rename } : {})
        },
        raw: {
          path: '@' + pathVar.identifier + (pathVar.fields ? '.' + pathVar.fields.map(f => f.name || f.index).join('.') : ''),
          section: section.type === 'VariableReference' ? '@' + section.identifier : (section.content || section),
          ...(rename ? { rename: rename[0].type === 'VariableReference' ? '@' + rename[0].identifier : rename[0].content } : {})
        },
        meta: {
          hasRename: !!rename
        },
        subtype: 'exeSection',
        source: 'section'
      };
    }

// Resolver pattern for exe context - handles @resolver/path [{ @payload }]
ExeResolverPattern "exe resolver pattern"
  = "@" resolver:ResolverPathPattern payload:ExecResolverPayload? {
      return {
        type: 'exeResolver',
        values: {
          resolver: [helpers.createVariableReferenceNode('varIdentifier', { identifier: resolver }, location())],
          ...(payload ? { payload: payload } : {})
        },
        raw: {
          resolver: resolver,
          ...(payload ? { payload: payload[0].identifier || payload[0].content } : {})
        },
        meta: {
          hasPayload: !!payload
        },
        subtype: 'exeResolver',
        source: 'resolver'
      };
    }

// Foreach pattern for exe context - wraps ForeachCommandExpression
ExeForeachPattern "exe foreach pattern"
  = foreach:ForeachCommandExpression {
      return {
        subtype: 'exeForeach',
        source: 'foreach',
        values: {
          content: [foreach]
        },
        raw: {
          foreach: foreach.rawText || 'foreach ...'
        },
        meta: {
          isForeach: true
        }
      };
    }


// Environment declaration for exe context - handles { helper1, helper2 }
ExeEnvironmentDeclaration "exe environment declaration"
  = "{" _ envVars:EnvironmentVarList _ "}" {
      return {
        type: 'exeEnvironment',
        values: {
          environment: envVars
        },
        raw: {
          environment: envVars.map(v => v.identifier)
        },
        meta: {
          environmentCount: envVars.length
        },
        subtype: 'environment',
        source: 'environment'
      };
    }

// -------------------------------------------------------------
// EXE STATEMENT BLOCKS
// -------------------------------------------------------------

ExeStatementBlock "exe statement block"
  = "[" _ body:ExeBlockBody _ "]" {
      const statements = body.statements || [];
      const normalize = (stmt) => Array.isArray(stmt) ? stmt.flat() : [stmt];
      const normalizedStatements = statements.flatMap(normalize);
      const hasReturn = !!body.returnStmt;
      return {
        subtype: 'exeBlock',
        source: 'block',
        values: {
          statements: normalizedStatements,
          ...(body.returnStmt ? { return: body.returnStmt } : {})
        },
        raw: {
          statements: helpers.reconstructRawString(normalizedStatements),
          hasReturn
        },
        meta: {
          statementCount: normalizedStatements.length,
          hasReturn
        }
      };
    }
  / "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'ExeBlockBody',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  / "[" _ &{
      let depth = 1;
      let i = peg$currPos;
      let inString = false;
      let quote = null;
      while (i < input.length && depth > 0) {
        const ch = input[i];
        if (inString) {
          if (ch === quote && input[i - 1] !== '\\') { inString = false; quote = null; }
        } else {
          if (ch === '"' || ch === '\'') { inString = true; quote = ch; }
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        i++;
      }
      return depth > 0;
    } {
      helpers.mlldError(
        `Unterminated block. Expected ']' to close the block.`,
        "]",
        location()
      );
    }

ExeBlockBody
  = statements:ExeBlockStatementList firstReturn:(
      BlockStatementSeparator ret:ExeReturnStatement { return ret; }
    / _ ret:ExeReturnStatement { return ret; }
    )
    extraReturn:(BlockStatementSeparator ExeReturnStatement { return true; })?
    trailing:(BlockStatementSeparator ExeBlockStatement { return true; })? {
      if (extraReturn) {
        helpers.mlldError(
          'Multiple return statements in exe block. Only one return allowed as last statement.',
          'single return',
          location()
        );
      }
      if (trailing) {
        helpers.mlldError(
          'Return must be the last statement in a block.',
          'end of block',
          location()
        );
      }
      return {
        statements,
        returnStmt: firstReturn
      };
    }
  / statements:ExeBlockStatementList {
      return {
        statements,
        returnStmt: null
      };
    }

ExeBlockStatementList
  = first:ExeBlockStatement rest:(BlockStatementSeparator stmt:ExeBlockStatement { return stmt; })* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt.flat() : [stmt];
      return [...normalize(first), ...rest.flatMap(normalize)];
    }

ExeBlockStatement
  = LetAssignment
  / AugmentedAssignment
  / WhenExpressionAny
  / ForNestedDirective
  / ExeBlockAction

ExeBlockAction
  = EffectAction
  / WhenRHSVarAssignment
  / WhenRHSCommandAction
  / WhenRHSFunctionCall
  / WhenRHSSkipAction
  / WhenRHSRetryAction
  / WhenRHSVariableReference
  / DoneLiteral
  / ContinueLiteral
  / ExeForeachPattern
  / ExeDataPattern

ExeReturnStatement "exe return statement"
  = "=>" _ value:ExeReturnValue? {
      const normalized = typeof value === 'undefined' ? [] : (Array.isArray(value) ? value.flat() : [value]);
      return {
        type: 'ExeReturn',
        values: normalized,
        raw: text(),
        meta: {
          hasValue: normalized.length > 0
        }
      };
    }

ExeReturnValue
  = WhenRHSAction

// -------------------------------------------------------------
// HELPER RULES (no conflicts with exe.peggy versions)
// -------------------------------------------------------------

// ResolverPathPattern - matches resolver paths like resolver/api/@endpoint/@parameter
// Must contain at least one slash to distinguish from simple identifiers like "run"
ResolverPathPattern
  = chars:$([a-zA-Z0-9_@-]+ "/" [a-zA-Z0-9_/@-]*) { return chars; }

// Stdin expressions for pipe sugar allow variables even when followed by tail modifiers
PipeStdinExpression
  = "(" _ expr:Expression _ ")" { return expr; }
  / VariableForPipeline
  / Expression

// ExecResolverPayload - optional payload syntax: { @variable }
ExecResolverPayload
  = _ "{" _ varRef:UnifiedVariableNoTail _ "}" {
      return [varRef];
    }

// AsNewTitle pattern for exec section renaming - supports both literals and variables
ExecAsNewTitle
  = _ "as" _ title:LiteralContent {
      return title;
    }
  / _ "as" _ varRef:UnifiedVariableNoTail {
      return [varRef];
    }

// -------------------------------------------------------------
// WHEN EXPRESSION - Conditional execution for executable assignments
// -------------------------------------------------------------

// WHEN EXPRESSION - Value-returning when expressions for executable assignments
// Used by: ExeRHSContent
// Purpose: Allow when: [...] expressions that return values based on first matching condition

WhenExpression "when expression"
  // Standard: when [ ... ] or when first [ ... ]
  = "when" _ modifier:WhenExprModifier? _ "[" _ conditions:WhenExpressionConditionList _ "]" tail:TailModifiers? {
      helpers.debug('WhenExpression matched', { 
        conditionCount: conditions.length,
        hasTailModifiers: !!tail,
        modifier: modifier
      });
      
      return helpers.createWhenExpression(conditions, tail, location(), modifier);
    }
  / "when" _ modifier:WhenExprModifier? _ "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'WhenExpressionConditionList',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  // Error recovery: Missing bracket after when
  / "when" _ WhenExprModifier? _ !"[" {
      helpers.mlldError(
        `Missing condition list in when expression. Expected: when [condition => value, ...]`,
        "[",
        location()
      );
    }
  // Error recovery: Unclosed bracket
  / "when" _ WhenExprModifier? _ "[" _ &{
      // Safer unclosed check for when-expressions: allow newlines; only error if EOF reached without ']'
      let depth = 1;
      let i = peg$currPos;
      let inString = false;
      let quote = null;
      while (i < input.length && depth > 0) {
        const ch = input[i];
        if (inString) {
          if (ch === quote && input[i - 1] !== '\\') { inString = false; quote = null; }
        } else {
          if (ch === '"' || ch === '\'') { inString = true; quote = ch; }
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        i++;
      }
      return depth > 0; // Only report if truly unclosed at EOF
    } {
      helpers.mlldError(
        `Unclosed array in when expression. Expected ']' to close the condition list.`,
        "]",
        location()
      );
    }

// Optional modifier for when-expression in /exe RHS (currently supports 'first')
WhenExprModifier = mod:("first") { return mod; }

// Value-oriented condition list for when expressions
// Reuses WhenConditionSeparator from when.peggy (shared abstraction)
WhenExpressionConditionList
  = first:WhenExpressionEntry rest:(WhenConditionSeparator entry:WhenExpressionEntry { return entry; })* {
      return [first, ...rest];
    }

// Single entry in a when expression - let assignment, augmented assignment, or condition pair
WhenExpressionEntry
  = LetAssignment               // let @x = value (local variable)
  / AugmentedAssignment         // @x += value (augmented assignment)
  / WhenExpressionConditionPair // condition => action

// Single condition => value pair for expressions
WhenExpressionConditionPair
  = condition:WhenConditionExpression _ "=>" _ action:WhenExpressionAction {
      // Allow actions to return either a single node or an array of nodes (e.g., retry with hint)
      const act = Array.isArray(action) ? action : [action];
      return { condition, action: act };
    }

// Actions in when expressions - for /exe context, supports both side effects and return values
WhenExpressionAction
  = block:ExeStatementBlock { return block; }
  / WhenRHSAction  // Use the unified pattern that supports show, output, var assignment, and values

// Inline single-condition when expression (no brackets)
WhenExpressionInline
  = "when" _ condition:WhenConditionExpression _ "=>" _ action:WhenExpressionAction {
      const act = Array.isArray(action) ? action : [action];
      const conditions = [{ condition: [condition], action: act }];
      return helpers.createWhenExpression(conditions, null, location(), null);
    }

// Alias to allow both inline and bracketed when expressions
WhenExpressionAny
  = WhenExpressionInline
  / WhenExpression

// -------------------------------------------------------------
// FOR EXPRESSION - Iteration with directive action support for executable assignments
// -------------------------------------------------------------

// FOR EXPRESSION - Exe-specific version that supports directive actions
// Used by: ExeRHSContent
// Purpose: Allow for @var in @collection => action where action can be a directive
ForExpressionExe "for expression with actions"
  = "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ action:ForExpressionExeBody batchPipe:ForBatchPipeline? {
      helpers.debug('ForExpressionExe matched', { pattern, action, hasBatch: !!batchPipe });
      
      return helpers.createForExpression(
        pattern.variable,
        pattern.source, 
        action,  // Accepts directive actions or block statements
        location(),
        opts || null,
        batchPipe || null
      );
    }
  // Error recovery
  / "for" _ "@" id:BaseIdentifier _ "in" _ source:VarRHSContent _ !( "=>" / "[" ) {
      helpers.mlldError("Missing '=>' in for expression. Expected: for @var in @collection => action", "=>", location());
    }
  / "for" _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in for expression. Expected: for @var in @collection => action", "in", location());
    }
  / "for" _ !"each" _ !"@" {
      helpers.mlldError("Invalid for expression syntax. Expected: for @var in @collection => action", "@", location());
    }

ForExpressionExeBody
  = "=>" _ action:ForExpressionAction { return action; }
  / block:ForBlockAction { return block.statements; }
