// EXE RHS CONTENT - Unified right-hand side for /exe directive
// Used by: /exe directive  
// Purpose: Route to appropriate content parser based on syntax detection

ExeRHSContent "exe assignment value"
  = ExeNewExpression              // new @Class(...) constructor expression
  / ExeProsePattern               // prose:@config {...} or prose:@config "file.prose"
  / leading:LeadingParallelPipeline {
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
  / LoopExpressionExe           // loop(...) [ ... ]
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

ExeNewExpression "exe new expression"
  = expr:NewExpression {
      return {
        subtype: 'exeValue',
        source: 'expression',
        values: {
          value: expr
        },
        raw: {
          value: text()
        },
        meta: {
          isNewExpression: true
        }
      };
    }

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
            execInvocation: invocation,
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
  = "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? _ withClause:WithClause {
      // Only allow with clauses that have stdin
      if (!withClause || !('stdin' in withClause)) {
        return null; // Let other patterns handle this
      }
      const mergedWithClause = using ? { ...using, ...withClause } : withClause;

      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values,
          withClause: mergedWithClause
        },
        raw: {
          ...content.raw,
          withClause: mergedWithClause
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
  = "run" _ stdinExpr:PipeStdinExpression _ "|" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? tail:TailModifiers? {
      const withClause = { stdin: stdinExpr };
      if (using) {
        Object.assign(withClause, using);
      }
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
  = "stream" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? tail:TailModifiers? {
      const withClause = { stream: true };
      if (using) {
        Object.assign(withClause, using);
      }
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
  = "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? {
      return {
        subtype: 'exeCommand',
        source: 'command',
        values: {
          ...content.values,
          ...(using ? { withClause: using } : {})
        },
        raw: {
          ...content.raw,
          ...(using ? { withClause: using } : {})
        },
        meta: using ? { ...content.meta, withClause: using } : content.meta
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

// Prose pattern for exe context - handles: prose:@config {...} or prose:@config "file.prose"
// Prose blocks are executed by passing interpolated content to the config's model executor
// with skill injection prompting to invoke the prose skill
ExeProsePattern "exe prose pattern"
  = "prose:" _ configRef:UnifiedVariableNoTail _ content:ProseInlineContent {
      helpers.debug('ExeProsePattern matched inline', { configRef, content });
      return {
        subtype: 'exeProse',
        source: 'prose',
        values: {
          configRef: [configRef],
          content: content.parts,
          contentType: 'inline'
        },
        raw: {
          configRef: '@' + configRef.identifier + (configRef.fields ? '.' + configRef.fields.map(f => f.value || f.name).join('.') : ''),
          content: content.raw,
          contentType: 'inline'
        },
        meta: {
          hasConfig: true,
          isInline: true,
          hasVariables: content.hasVariables || false
        }
      };
    }
  / "prose:" _ configRef:UnifiedVariableNoTail _ "template" _ path:QuotedStringPath {
      helpers.debug('ExeProsePattern matched template file', { configRef, path });
      return {
        subtype: 'exeProseTemplate',
        source: 'proseTemplate',
        values: {
          configRef: [configRef],
          path: path.values.path,
          contentType: 'template'
        },
        raw: {
          configRef: '@' + configRef.identifier + (configRef.fields ? '.' + configRef.fields.map(f => f.value || f.name).join('.') : ''),
          path: path.raw.path,
          contentType: 'template'
        },
        meta: {
          hasConfig: true,
          isTemplate: true,
          pathMeta: path.meta
        }
      };
    }
  / "prose:" _ configRef:UnifiedVariableNoTail _ path:QuotedStringPath {
      helpers.debug('ExeProsePattern matched file reference', { configRef, path });
      return {
        subtype: 'exeProseFile',
        source: 'proseFile',
        values: {
          configRef: [configRef],
          path: path.values.path,
          contentType: 'file'
        },
        raw: {
          configRef: '@' + configRef.identifier + (configRef.fields ? '.' + configRef.fields.map(f => f.value || f.name).join('.') : ''),
          path: path.raw.path,
          contentType: 'file'
        },
        meta: {
          hasConfig: true,
          isFile: true,
          pathMeta: path.meta
        }
      };
    }
  / "prose" _ !(":" _) {
      helpers.mlldError(
        "Prose blocks require a config reference. Use: prose:@config { ... } or prose:@config \"file.prose\"",
        ":",
        location()
      );
    }

// Prose inline content - braces containing prose syntax
// Variables are interpolated using ATT style (@var) before passing to executor
ProseInlineContent "prose inline content"
  = "{" parts:ProseContentParts "}" {
      // Build raw string from parts
      const raw = parts.map(p => {
        if (p.type === 'Text') return p.content || '';
        if (p.type === 'VariableReference') return '@' + p.identifier + (p.fields ? '.' + p.fields.map(f => f.value || f.name).join('.') : '');
        if (p.type === 'ExecInvocation') return '@' + (p.commandRef?.identifier || 'fn') + '(...)';
        return '';
      }).join('');
      const hasVariables = parts.some(p => p.type === 'VariableReference' || p.type === 'ExecInvocation');
      return { parts, raw: raw.trim(), hasVariables };
    }

// Parts inside prose block - ATT-style @var interpolation
// Uses ProseAtInterpolation (no text fallback) + ProseTextSegment (stops at })
ProseContentParts "prose content parts"
  = (ProseAtInterpolation / ProseTextSegment)*

// Prose-specific @var interpolation - like UnifiedAtInterpolation but WITHOUT text fallback
// This ensures ProseTextSegment handles plain text and stops at }
ProseAtInterpolation "prose @ interpolation"
  = ConditionalTemplateSnippet   // @var?`...`
  / NullCoalescingTight          // @var??"default"
  / ConditionalVariableOmission  // @var?
  / ExecResultMethodCall         // @func(args).method(args)
  / FieldAccessExec              // @obj.method(args)
  / UnifiedExecInvocation        // @func(args)
  / TemplateVariableReference    // @var (with template pipes and fields)
  / UnifiedReferenceNoTail       // Fallback for @var.field without pipes
  / "@@" {                       // @@ -> literal @
      return helpers.createNode(NodeType.Text, { content: '@', location: location() });
    }
  / "\\@" {                      // \@ -> literal @
      return helpers.createNode(NodeType.Text, { content: '@', location: location() });
    }
  / "@" !BaseIdentifier char:. { // @ followed by non-identifier (like @:)
      return helpers.createNode(NodeType.Text, { content: '@' + char, location: location() });
    }
  // NOTE: No text fallback here - ProseTextSegment handles plain text

// Text segment for prose - stops at } and @
ProseTextSegment "prose text segment"
  = chars:(!("}" / "\\@" / "@") char:. { return char; })+ {
      return helpers.createNode(NodeType.Text, { content: chars.join(''), location: location() });
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
      return helpers.createNode('ExeBlock', {
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
        },
        location: location()
      });
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
  / leadingComments:LeadingBlockComment* _ ret:ExeReturnStatement {
      return {
        statements: [],
        returnStmt: ret
      };
    }

ExeBlockStatementList
  = leadingComments:LeadingBlockComment* _ first:ExeBlockStatement rest:(BlockStatementSeparator stmt:ExeBlockStatement { return stmt; })* trailing:BlockComments* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt.flat() : [stmt];
      const stmts = [...normalize(first), ...rest.flatMap(normalize)];
      // Attach leading comments to first statement's meta (immutable update)
      if (leadingComments.length > 0 && stmts.length > 0) {
        const firstStmt = stmts[0];
        if (firstStmt && typeof firstStmt === 'object') {
          const existingMeta = firstStmt.meta || {};
          stmts[0] = {
            ...firstStmt,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return stmts;
    }
  / BlockComments+ { return []; }

ExeBlockStatement
  = LetAssignment
  / AugmentedAssignment
  / WhenExpressionAny
  / ForNestedDirective
  / SlashIf
  / SlashBail
  / ExeBlockAction

ExeBlockAction
  = RunBlockAction
  / EffectAction
  / WhenRHSVarAssignment
  / WhenRHSCommandAction
  / WhenRHSFunctionCall
  / WhenRHSSkipAction
  / WhenRHSRetryAction
  / WhenRHSVariableReference
  / DoneLiteral
  / ContinueLiteral
  / BailAction
  / ExeForeachPattern
  / ExeDataPattern

ExeReturnStatement "exe return statement"
  = "=>" _ value:ExeReturnValue? noise:BlockComments* {
      const normalized = typeof value === 'undefined' ? [] : (Array.isArray(value) ? value.flat() : [value]);
      return helpers.createNode('ExeReturn', {
        values: normalized,
        raw: text(),
        meta: {
          hasValue: normalized.length > 0
        },
        location: location()
      });
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
  // Bound-value: when <expr> [patterns]
  = "when" _ boundValue:Expression _ modifier:WhenExprModifier? _ "[" _ entries:WhenBoundExpressionConditionList _ "]" tail:TailModifiers? {
      const boundOffset =
        boundValue && typeof boundValue === 'object' && boundValue.location && boundValue.location.start
          ? boundValue.location.start.offset
          : location().start.offset;
      const boundIdentifier = `__when_bound_${boundOffset}`;

      const conditions = entries.map((entry) => {
        if (entry && typeof entry === 'object' && 'pattern' in entry) {
          const conditionExpr = helpers.buildWhenBoundPatternExpression(boundIdentifier, entry.pattern);
          return { condition: [conditionExpr], action: entry.action };
        }
        return entry;
      });

      helpers.debug('WhenExpression matched', { 
        conditionCount: conditions.length,
        hasTailModifiers: !!tail,
        modifier: modifier,
        hasBoundValue: true
      });
      
      return helpers.createWhenExpression(conditions, tail, location(), modifier, { boundIdentifier, boundValue });
    }
  / "when" _ boundValue:Expression _ modifier:WhenExprModifier? _ "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'WhenBoundExpressionConditionList',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  // Standard: when [ ... ] (first-match)
  / "when" _ modifier:WhenExprModifier? _ "[" _ conditions:WhenExpressionConditionList _ "]" tail:TailModifiers? {
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
  // Error recovery patterns removed - they were overly aggressive and prevented
  // WhenExpressionInline from matching. The inline form (when @condition => action)
  // handles the main use case, and specific error messages are less important than
  // correct parsing behavior.
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

// Bound pattern list for when expressions
WhenBoundExpressionConditionList
  = leadingComments:LeadingBlockComment* _ first:WhenBoundExpressionEntry rest:(WhenConditionSeparator entry:WhenBoundExpressionEntry { return entry; })* trailing:BlockComments* {
      const entries = [first, ...rest];
      if (leadingComments.length > 0 && entries.length > 0) {
        const firstEntry = entries[0];
        if (firstEntry && typeof firstEntry === 'object') {
          const existingMeta = firstEntry.meta || {};
          entries[0] = {
            ...firstEntry,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return entries;
    }
  / BlockComments+ { return []; }

WhenBoundExpressionEntry
  = LetAssignment
  / AugmentedAssignment
  / WhenBoundExpressionConditionPair
  / ExeBlockAction

WhenBoundExpressionConditionPair
  = pattern:WhenBoundPatternExpression _ "=>" _ action:WhenExpressionAction {
      const act = Array.isArray(action) ? action : [action];
      return { pattern, action: act };
    }

WhenBoundPatternExpression
  = WhenBoundPatternOr

WhenBoundPatternOr
  = first:WhenBoundPatternAnd rest:(_ "||" _ right:WhenBoundPatternAnd { return { op: "||", right }; })* {
      if (!rest || rest.length === 0) return first;
      return { kind: 'logical', first, rest, location: location() };
    }

WhenBoundPatternAnd
  = first:WhenBoundPatternAtom rest:(_ "&&" _ right:WhenBoundPatternAtom { return { op: "&&", right }; })* {
      if (!rest || rest.length === 0) return first;
      return { kind: 'logical', first, rest, location: location() };
    }

WhenBoundPatternAtom
  = "(" _ inner:WhenBoundPatternExpression _ ")" { return inner; }
  / wc:WildcardLiteral { return { kind: 'wildcard', node: wc, location: location() }; }
  / op:UnifiedComparisonOp _ right:UnifiedComparison { return { kind: 'compare', op, right, location: location() }; }
  / value:UnifiedComparison { return { kind: 'equals', value, location: location() }; }

// Optional modifier for when-expression in /exe RHS (rejected)
WhenExprModifier = mod:("first") {
      // 'first' is redundant — when already uses first-match semantics by default.
      // Silently accept for backwards compatibility with existing modules.
      return mod;
    }

// Value-oriented condition list for when expressions
// Reuses WhenConditionSeparator from when.peggy (shared abstraction)
WhenExpressionConditionList
  = leadingComments:LeadingBlockComment* _ first:WhenExpressionEntry rest:(WhenConditionSeparator entry:WhenExpressionEntry { return entry; })* trailing:BlockComments* {
      const entries = [first, ...rest];
      if (leadingComments.length > 0 && entries.length > 0) {
        const firstEntry = entries[0];
        if (firstEntry && typeof firstEntry === 'object') {
          const existingMeta = firstEntry.meta || {};
          entries[0] = {
            ...firstEntry,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return entries;
    }
  / BlockComments+ { return []; }

// Single entry in a when expression - let assignment, augmented assignment, action, or condition pair
WhenExpressionEntry
  = LetAssignment               // let @x = value (local variable)
  / AugmentedAssignment         // @x += value (augmented assignment)
  / WhenExpressionConditionPair // condition => action
  / ExeBlockAction              // show, log, run, etc. - imperative actions

// Single condition => value pair for expressions
WhenExpressionConditionPair
  = condition:WhenConditionExpression _ "=>" _ action:WhenExpressionAction {
      // Allow actions to return either a single node or an array of nodes (e.g., retry with hint)
      const act = Array.isArray(action) ? action : [action];
      return { condition, action: act };
    }

// Actions in when expressions - for /exe context, supports both side effects and return values
// Note: ArrayLiteral must come before ExeStatementBlock since both start with '['
// Empty arrays [] would otherwise be parsed as empty blocks
WhenExpressionAction
  = ArrayLiteral           // Array literals (including empty [])
  / DataObjectLiteral      // Object literals { key: value }
  / block:ExeStatementBlock { return block; }
  / WhenRHSAction  // Use the unified pattern that supports show, output, var assignment, and values

// Inline single-condition when expression: when @condition => action
// Block form is handled by WhenExpressionInlineBlock
WhenExpressionInline
  = "when" _ condition:WhenConditionExpression _ "=>" _ action:WhenExpressionAction {
      const act = Array.isArray(action) ? action : [action];
      const conditions = [{ condition: [condition], action: act }];
      return helpers.createWhenExpression(conditions, null, location(), null);
    }

// Alias to allow both inline and bracketed when expressions
// WhenExpressionInlineBlock handles `when @condition [statements]` where block starts with statement keywords
// This must come BEFORE WhenExpression to prevent WhenExpression from incorrectly parsing statement blocks
WhenExpressionAny
  = WhenExpressionInlineBlock
  / WhenExpression
  / WhenExpressionInline

// Error recovery: when @condition [block] where block starts with statement keywords
// The match form when @expr [patterns] already handles condition-like blocks above.
// This catches imperative blocks (show, let, for, etc.) that don't look like match patterns.
WhenExpressionInlineBlock
  = "when" _ condition:WhenConditionExpression _ &("[" _ ("let" / "show" / "for" / "when" / "log" / "output" / "run" / "var" / "=>" )) "[" {
      const conditionText = helpers.reconstructRawString(condition);
      helpers.mlldError(
        `when ${conditionText} [...] is ambiguous. Did you mean:\n\n` +
        `  when ${conditionText} => [block]    Value-returning block (keeps when semantics)\n` +
        `  if ${conditionText} [block]         Imperative flow (different return behavior!)\n\n` +
        `Note: Inside exe/for, these have different return semantics.\n` +
        `  when @cond => [=> @val]   returns @val from the when expression\n` +
        `  if @cond [=> @val]        returns @val from the enclosing exe\n\n` +
        `if vs when:\n` +
        `  if @cond [block]                 Run block if true\n` +
        `  when @cond => action             Select first match\n` +
        `  when [cond => val; * => default] First-match list\n` +
        `  when @val ["a" => x; * => y]    Match value against patterns`,
        "=> or if",
        location()
      );
    }

// -------------------------------------------------------------
// FOR EXPRESSION - Iteration with directive action support for executable assignments
// -------------------------------------------------------------

// FOR EXPRESSION - Exe-specific version that supports directive actions
// Used by: ExeRHSContent
// Purpose: Allow for @var in @collection => action where action can be a directive
ForExpressionExe "for expression with actions"
  = "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ "when" _ condition:WhenConditionExpression _ block:ForBlockAction batchPipe:ForBatchPipeline? {
      const action = Array.isArray(block.statements) ? block.statements : [block.statements];
      const initialWhen = helpers.createWhenExpression(
        [{ condition: [condition], action }],
        null,
        location(),
        null
      );

      const loc = initialWhen.location || location();
      const noneLiteral = helpers.createNode(NodeType.Literal, {
        value: 'none',
        valueType: 'none',
        location: loc
      });
      const skipLiteral = helpers.createNode(NodeType.Literal, {
        value: 'skip',
        valueType: 'skip',
        location: loc
      });
      const conditions = [...initialWhen.conditions, { condition: [noneLiteral], action: [skipLiteral] }];
      const normalizedWhen = helpers.createWhenExpression(
        conditions,
        initialWhen.withClause || null,
        loc,
        initialWhen.meta?.modifier || null
      );

      helpers.debug('ForExpressionExe when-guard block matched', {
        pattern,
        statementCount: action.length
      });

      return helpers.createForExpression(
        pattern.variable,
        pattern.source,
        [normalizedWhen],
        location(),
        opts || null,
        batchPipe || null,
        pattern.key || null
      );
    }
  / "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ whenExpr:WhenExpressionAny batchPipe:ForBatchPipeline? {
      const hasNoneCondition = Array.isArray(whenExpr.conditions) && whenExpr.conditions.some((entry) => {
        const condition = entry && entry.condition;
        return Array.isArray(condition) &&
          condition.length === 1 &&
          condition[0]?.type === NodeType.Literal &&
          condition[0]?.valueType === 'none';
      });

      let normalizedWhen = whenExpr;
      if (!hasNoneCondition) {
        const loc = whenExpr.location || location();
        const noneLiteral = helpers.createNode(NodeType.Literal, {
          value: 'none',
          valueType: 'none',
          location: loc
        });
        const skipLiteral = helpers.createNode(NodeType.Literal, {
          value: 'skip',
          valueType: 'skip',
          location: loc
        });
        const conditions = [...whenExpr.conditions, { condition: [noneLiteral], action: [skipLiteral] }];
        normalizedWhen = helpers.createWhenExpression(
          conditions,
          whenExpr.withClause || null,
          loc,
          whenExpr.meta?.modifier || null
        );
      }

      helpers.debug('ForExpressionExe when-filter matched', { pattern, hasNoneCondition });

      return helpers.createForExpression(
        pattern.variable,
        pattern.source, 
        [normalizedWhen],  // Accepts directive actions or block statements
        location(),
        opts || null,
        batchPipe || null,
        pattern.key || null
      );
    }
  / "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ action:ForExpressionExeBody batchPipe:ForBatchPipeline? {
      helpers.debug('ForExpressionExe matched', { pattern, action, hasBatch: !!batchPipe });
      
      return helpers.createForExpression(
        pattern.variable,
        pattern.source, 
        action,  // Accepts directive actions or block statements
        location(),
        opts || null,
        batchPipe || null,
        pattern.key || null
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

// LOOP EXPRESSION - loop(...) [ ... ]
LoopExpressionExe "loop expression"
  = "loop" _ header:LoopHeader? untilClause:LoopUntilClause? _ block:LoopBlockAction {
      const limit = header ? header.limit : null;
      const rateMs = header ? header.rateMs : null;
      const until = untilClause || null;
      const statements = block.statements || [];

      return helpers.createLoopExpression(
        limit,
        rateMs,
        until,
        statements,
        location()
      );
    }
  / "loop" _ "(" _ ")" {
      helpers.mlldError(
        'loop() requires a limit or endless. Expected: loop(<cap>[, <rate>]) [ ... ]',
        'loop(10)',
        location()
      );
    }
  / "loop" _ limit:LoopLimit _ {
      helpers.mlldError(
        'Missing \'(\' after loop keyword. Expected: loop(<cap>[, <rate>]) [ ... ]',
        '(',
        location()
      );
    }
  / "loop" _ "until" _ !WhenConditionExpression {
      helpers.mlldError(
        'loop until requires a condition. Expected: loop until @condition [ ... ]',
        '@condition',
        location()
      );
    }
  / "loop" _ header:LoopHeader? untilClause:LoopUntilClause? _ !("[" / "until") {
      helpers.mlldError(
        'loop requires a block. Expected: loop [ ... ]',
        '[',
        location()
      );
    }
