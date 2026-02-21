// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = LeadingParallelPipeline     // Leading || for parallel pipeline execution
  / ExpressionWithOperator      // Try expressions FIRST but only if operators present
  / WhenExpressionAny           // Allow value-returning when-expressions (inline or bracketed)
  / ForExpression               // for @var in @collection => expression
  / LoopExpression              // loop(...) [ ... ]
  / ForeachCommandExpression    // foreach @command(@arrays)
  / ExecResultMethodCall        // @func(args).method(args) on exec result
  / NewExpression               // new @Class(...) constructor expression
  / ExecInvocationWithFields    // Exec invocations followed by field/index access (must come before FieldAccessExecPattern)
  / FieldAccessExecPattern      // Field access exec invocations @obj.method()
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / EnvExpression               // env @config [...] - scoped environment with return value
  / CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateWithPipeline        // Template content with pipeline support - MUST come before PrimitiveValue
  / VarBlock                    // Statement block for var evaluation
  / ArrayLiteral                // Arrays: [1, 2, 3] - MUST come before templates to handle [[nested]]
  / DataObjectLiteral           // Use data-context object parsing for proper typing
  / UnifiedQuoteOrTemplate      // Unified quotes and templates (moved after arrays)
  / AlligatorWithFields         // File/URL with field access: <file.md>.field - must come before AlligatorExpression
  / AlligatorWithPostPipes      // <file> followed by external pipe chain with optional whitespace/newlines
  / AlligatorExpression         // File/URL loading: <file.md> - always loading! (includes transform/rename)
  / VariableWithSpacedPipes     // Variable references @var with spaced or unspaced pipes
  / VariableReferenceWithTail   // Variable references @var with optional tail modifiers
  / NestedDirective             // Nested directives @run, etc.
  / InlineShowDirective         // show actions used inline (for expressions)
  / PrimitiveValue              // Direct primitives: 42, true, false, null, and strings WITHOUT pipes

VarBlock "var block"
  = &{
      let i = peg$currPos;
      if (input[i] !== '[') return false;
      i += 1;
      while (i < input.length) {
        const ch = input[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          i += 1;
          continue;
        }
        if (input[i] === '>' && input[i + 1] === '>') {
          i += 2;
          while (i < input.length && input[i] !== '\n') i += 1;
          continue;
        }
        if (input[i] === '<' && input[i + 1] === '<') {
          i += 2;
          while (i < input.length && input[i] !== '\n') i += 1;
          continue;
        }
        break;
      }
      const rest = input.substring(i);
      if (rest.startsWith('let')) return true;
      if (rest.startsWith('=>')) return true;
      if (/^@[_a-zA-Z]\w*\s*\+=/.test(rest)) return true;
      return false;
    } block:ExeStatementBlock { return block; }

// Expression that definitely has an operator (to avoid matching simple variables)
ExpressionWithOperator
  = &{
      // Look ahead to see if there's an operator somewhere IN THE CURRENT DIRECTIVE
      // Stop at: newline, next directive (/), or comment marker (>> or <<)
      const rest = input.substring(peg$currPos);
      // Only look within the current line/directive context
      const endOfContext = rest.search(/[\n\r]|(?:^|\s)\/\w+|(?:^|\s)(?:>>|<<)/);
      const contextToSearch = endOfContext === -1 ? rest : rest.substring(0, endOfContext);
      return /(\s*(&&|\|\||==|!=|<=|>=|<|>|\?\?|!|[-+*/%]))|(\s*\?\s*[^:]+\s*:)/.test(contextToSearch);
    }
    expr:Expression {
      return expr;
    }

// EXEC INVOCATION FOLLOWED BY FIELDS - e.g., @func()[1] or @obj.method().2
ExecInvocationWithFields "exec invocation with post fields"
  = base:FieldAccessExecPattern post:PostFieldAccess+ {
      return helpers.attachPostFields(base, post);
    }
  / base:ExecInvocationPattern post:PostFieldAccess+ {
      return helpers.attachPostFields(base, post);
    }

// Note: AlligatorWithTransform was removed because AlligatorExpression 
// already handles "as" clauses internally in alligator.peggy

// ALLIGATOR WITH FIELDS - Handles <file.md>.field syntax for direct assignment
// This pattern allows field access after file references outside of template contexts
AlligatorWithFields "alligator with field access"
  = base:AlligatorExpression fields:AnyFieldAccessOptional+ pipes:SpacedOrCondensedPipeChain? {
      helpers.debug('AlligatorWithFields matched', { 
        source: base.source,
        fieldCount: fields.length,
        pipeCount: pipes ? pipes.length : 0
      });
      
      // Combine pipes from base (before >) and pipes after fields
      const allPipes = [...(base.pipes || []), ...(pipes || [])];
      
      // Convert load-content node to FileReference node with fields
      return helpers.createFileReferenceNode(
        base.source,
        fields,
        allPipes,
        location()
      );
    }

// TEMPLATE WITH PIPELINE - Handles template content (quoted/backtick) followed by pipes
// Note: We use HWS (horizontal whitespace) before the first pipe to prevent matching
// pipes on the next line unless they're intentionally continued
TemplateWithPipeline "template with pipeline"
  = template:UnifiedQuoteOrTemplate pipes:SpacedOrCondensedPipeChain {
      helpers.debug('TemplateWithPipeline matched', { 
        template: template.wrapperType,
        pipelineCount: pipes.length
      });
      
      // Extract the actual content from the template
      const content = template.content || [helpers.createNode(NodeType.Text, { content: '', location: location() })];
      
      // Convert tail pipes (with optional whitespace) to pipeline format
      const pipeline = pipes.map(pipe => ({
        identifier: [helpers.createVariableReferenceNode('varIdentifier', { 
          identifier: pipe.transform 
        }, location())],
        args: pipe.args || [],
        fields: [],
        rawIdentifier: pipe.transform,
        rawArgs: pipe.args || []
      }));
      
      return {
        content: content,
        wrapperType: template.wrapperType,
        withClause: {
          pipeline: pipeline
        }
      };
    }

// ALLIGATOR WITH POST PIPES - Merge inside-angle pipes with external spaced/condensed pipe chains
AlligatorWithPostPipes "alligator with external pipe chain"
  = base:AlligatorExpression pipes:SpacedOrCondensedPipeChain {
      helpers.debug('AlligatorWithPostPipes matched', {
        innerPipes: base.pipes ? base.pipes.length : 0,
        outerPipes: pipes.length
      });
      const allPipes = [...(base.pipes || []), ...(pipes || [])];
      return {
        ...base,
        ...(allPipes.length > 0 ? { pipes: allPipes } : {})
      };
    }

// VARIABLE WITH PIPES (outside template contexts)
// Optional whitespace form that accepts full CommandArgumentList for args
VariableWithSpacedPipes "variable with flexible pipe syntax"
  = "@" id:BaseIdentifier fields:AnyFieldAccessOptional* firstPipe:(_ pipeStart:("" { return peg$currPos; }) "|" _ command:PipeCommand { return { command, pipeStart }; })? restPipes:SpacedOrCondensedPipe* {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      // Collect all pipes
      const pipes = [];
      if (firstPipe) {
        const loc = location();
        const startOffset = firstPipe.pipeStart;
        pipes.push({
          type: 'CondensedPipe',
          transform: firstPipe.command.fullName,
          hasAt: true,
          args: firstPipe.command.args || [],
          fields: firstPipe.command.fields || [],
          location: {
            source: loc.source,
            start: { 
              offset: startOffset,
              line: loc.start.line,
              column: loc.start.column - (loc.start.offset - startOffset)
            },
            end: loc.end
          }
        });
      }
      if (restPipes && restPipes.length > 0) {
        pipes.push(...restPipes);
      }
      
      if (pipes.length > 0) {
        return {
          ...varRef,
          pipes: pipes
        };
      }
      
      return varRef;
    }

// Flexible pipe pattern for var RHS - allows whitespace and optional args
SpacedOrCondensedPipe
  = _ pipeStart:("" { return peg$currPos; }) "|" _ command:PipeCommand {
      const loc = location();
      const startOffset = pipeStart;
      return {
        type: 'CondensedPipe',
        transform: command.fullName,
        hasAt: true,
        args: command.args || [],
        fields: command.fields || [],
        location: {
          source: loc.source,
          start: { 
            offset: startOffset,
            line: loc.start.line,
            column: loc.start.column - (loc.start.offset - startOffset)
          },
          end: loc.end
        }
      };
    }

// Pipe command syntax for non-template pipelines: @name or @name(args)
PipeCommand "pipe command"
  = "@" name:BaseIdentifier fieldParts:(_ "." _ part:BaseIdentifier { return part; })* args:( _ "(" _ a:CommandArgumentList? _ ")" { return a || []; } )? {
      const fields = fieldParts || [];
      const fullName = fields.length > 0 ? `${name}.${fields.join('.')}` : name;
      return { name, fullName, fields, args: args || [] };
    }

// Chain of spaced-or-condensed pipes
SpacedOrCondensedPipeChain "flexible pipe chain"
  = pipes:SpacedOrCondensedPipe+ { return pipes; }

// FIELD ACCESS EXEC PATTERN - Matches @obj.field() with nested field access
FieldAccessExecPattern "field access exec invocation"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier fields:AnyFieldAccessOptional+ "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* tail:TailModifiers? {
      // Extract the last field as the method name
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      // Create variable reference for the object path (all fields except last)
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the exec invocation
      const identifierRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        fields
      }, location());
      const ref = {
        name: methodName,
        identifier: [identifierRef],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      const exec = helpers.createExecInvocation(ref, tail || null, location());
      if (streamPrefix) {
        const mergedTail = tail ? { ...tail, stream: true } : { stream: true };
        const execWithStream = helpers.createExecInvocation(ref, mergedTail, location());
        return helpers.attachPostFields(execWithStream, post);
      }
      return helpers.attachPostFields(exec, post);
    }

// EXEC INVOCATION PATTERN - Matches @func() specifically
ExecInvocationPattern "exec invocation pattern"
  = streamPrefix:StreamKeyword? _ "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* tail:TailModifiers? {
      // Create command reference with arguments
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      const exec = helpers.createExecInvocation(ref, tail || null, location());
      if (streamPrefix) {
        const mergedTail = tail ? { ...tail, stream: true } : { stream: true };
        const execWithStream = helpers.createExecInvocation(ref, mergedTail, location());
        return helpers.attachPostFields(execWithStream, post);
      }
      return helpers.attachPostFields(exec, post);
    }

// Note: BracketAmbiguous removed - use ArrayLiteral for arrays, AlligatorExpression for file loading


// Primitive values for when expressions and var assignments (returns Literal nodes)
PrimitiveValue
  = ExpressionString        // Returns Literal node for both single and double quotes
  / value:NumberLiteral {
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'number',
        location: location()
      });
    }
  / value:BooleanLiteral {
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'boolean',
        location: location()
      });
    }
  / value:NullLiteral {
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'null',
        location: location()
      });
    }
  / DoneLiteral
  / ContinueLiteral
  / RetryLiteral           // retry keyword for pipeline control

// Object property values - use data context patterns for proper typing and unwrapping
ObjectPropertyValue "object property value"
  = DataPropertyValue           // Delegate to data-context patterns


// Run command in object context
RunCommandValue
  = "run" _ "\"" command:$([^"]*) "\"" {
      // Quoted command syntax: run "echo hello"
      // Parse the command string to extract parts with proper location
      const commandLocation = location();
      const parts = helpers.parseCommandContent(command, commandLocation);
      
      // Extract command base
      let commandBases = [];
      
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: commandLocation
          }));
        }
      }
      
      return {
        type: 'command',
        command: parts,
        commandBases: commandBases,
        hasRunKeyword: true,
        meta: {
          isMultiLine: false,
          commandCount: commandBases.length,
          hasScriptRunner: false
        }
      };
    }
  / "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? {
      // In 'run' contexts: supports both "run cmd {...}" and "run {...}" (bare brackets for backward compatibility)
      // In standalone contexts: bare {...} requires explicit cmd prefix
      const result = {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        workingDir: content.values.workingDir,
        workingDirMeta: content.meta?.workingDirMeta,
        hasRunKeyword: true,
        meta: content.meta
      };
      if (using) {
        result.using = using;
      }
      return result;
    }
  / "run" _ "@" invocation:UnifiedReferenceWithTail {
      // Handle run @command() syntax with unified patterns
      return {
        type: 'runExec',
        invocation: invocation,
        hasRunKeyword: true
      };
    }

// Code execution in object context  
CodeExecutionValue
  = lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }


// Property key - shared between old ObjectLiteral and DataObjectLiteral
PropertyKey
  = BaseIdentifier
  / DataString      // Use DataString for object property keys

// Nested directive like @run
NestedDirective
  = "@"? "run" _ lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Inline code execution
      return {
        type: 'nestedDirective',
        directive: 'run',
        language: lang,
        code: code
      };
    }
  / "@"? "run" _ "[" _ cmd:CommandContent _ "]" {
      // Command execution
      return {
        type: 'nestedDirective', 
        directive: 'run',
        command: cmd
      };
  }

InlineShowDirective
  = "show" _ content:(UnifiedQuoteOrTemplate / UnifiedReferenceWithTail) ending:StandardDirectiveEnding {
      return helpers.createForActionNode('show', content, location(), ending ? ending.tail : null, ending ? ending.comment : null);
    }

// Command content inside brackets
CommandContent
  = chars:(!"]" .)* {
      return chars.map(c => c[1]).join('');
    }

// Note: Bracket section patterns removed - use AlligatorExpression for section extraction

// Code execution patterns (language + code without @run prefix)
CodeExecution "code execution"
  = "run" _ lang:VarCodeLanguage workingDir:WorkingDirPath? _ "{" _ content:CodeBlockContent _ "}" {
      // Language-specific code execution (js, python, etc.) with optional working directory
      const result = {
        type: 'code',
        language: lang,
        code: content,
        hasRunKeyword: true
      };
      if (workingDir) {
        result.workingDir = workingDir.parts;
        result.meta = { workingDirMeta: workingDir.meta, hasWorkingDir: true };
      }
      return result;
    }
  / "run" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) using:UsingClause? {
      // In 'run' contexts: supports both "run cmd {...}" and "run {...}" (bare brackets for backward compatibility)
      const result = {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        workingDir: content.values.workingDir,
        workingDirMeta: content.meta?.workingDirMeta,
        hasRunKeyword: true,
        meta: content.meta
      };
      if (using) {
        result.using = using;
      }
      return result;
    }
  / lang:VarCodeLanguage workingDir:WorkingDirPath? _ "{" _ code:CodeBlockContent _ "}" {
      // Shorthand: language + code without 'run' keyword, with optional working directory
      const result = {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
      if (workingDir) {
        result.workingDir = workingDir.parts;
        result.meta = { workingDirMeta: workingDir.meta, hasWorkingDir: true };
      }
      return result;
    }
  / content:CmdCommandBrackets {
      // Shorthand: cmd {...} without 'run' keyword
      return {
        type: 'command',
        command: content.values.command,
        commandBases: content.values.commandBases,
        workingDir: content.values.workingDir,
        workingDirMeta: content.meta?.workingDirMeta,
        hasRunKeyword: false,
        meta: content.meta
      };
    }

// ENV EXPRESSION - env @config [...] for scoped environment with return value
// Used in /var assignments to execute code in a scoped environment and return the result
EnvExpression "env expression"
  = "env" _ config:EnvConfigExpression? withClause:WithClause? &{ return !!config || !!withClause; } _ block:ExeStatementBlock {
      const values = {
        ...(config ? { config: [config] } : {}),
        ...(withClause ? { withClause } : {}),
        block
      };

      const raw = {};
      if (config) {
        raw.config = helpers.reconstructRawString([config]);
      }

      const meta = {
        statementCount: block?.meta?.statementCount ?? (block?.values?.statements?.length || 0),
        hasReturn: block?.meta?.hasReturn === true
      };

      if (withClause) {
        raw.withClause = withClause;
        meta.withClause = withClause;
      }

      return helpers.createStructuredDirective(
        'env',
        'env',
        values,
        raw,
        meta,
        location(),
        'env'
      );
    }
  / "env" _ config:EnvConfigExpression? withClause:WithClause? &{ return !config && !withClause; } {
      helpers.mlldError(
        'env requires a config expression or with clause. Expected: env @config [ ... ] or env with { ... } [ ... ]',
        '@config or with { ... }',
        location()
      );
    }
  / "env" _ config:EnvConfigExpression? withClause:WithClause? _ !("[" / BlockComments) {
      helpers.mlldError(
        'env requires a block. Expected: env @config [ ... ] or env with { ... } [ ... ]',
        '[',
        location()
      );
    }

// Language keywords for var code execution
VarCodeLanguage "code language"
  = "js" / "javascript" / "node" / "python" / "py" / "bash" / "sh"

// Code block content - preserve everything literally
CodeBlockContent "code block content"
  = chars:CodeChar* {
      return chars.join('');
    }

// Characters in code blocks (handle nested braces)
CodeChar
  = "{" inner:CodeBlockContent "}" {
      return '{' + inner + '}';
    }
  / !"}" char:. {
      return char;
    }

// Note: when-expressions are allowed in /var assignments

// FOR EXPRESSION - for @var in @collection => expression or block
// Used in /var and /exe assignments to collect results
ForExpression "for expression"
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

      helpers.debug('ForExpression when-guard block matched', {
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

      helpers.debug('ForExpression when-filter matched', { pattern, hasNoneCondition });

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
  / "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ action:ForExpressionBody batchPipe:ForBatchPipeline? {
      helpers.debug('ForExpression matched', { pattern, action, hasBatch: !!batchPipe });
      
      return helpers.createForExpression(
        pattern.variable,
        pattern.source, 
        action,
        location(),
        opts || null,
        batchPipe || null,
        pattern.key || null
      );
    }
  // Error recovery
  / "for" _ "@" id:BaseIdentifier _ "in" _ source:VarRHSContent _ !( "=>" / "[" ) {
      helpers.mlldError("Missing '=>' in for expression. Expected: for @var in @collection => expression", "=>", location());
    }
  / "for" _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in for expression. Expected: for @var in @collection => expression", "in", location());
    }
  / "for" _ !"each" _ !"@" {
      helpers.mlldError("Invalid for expression syntax. Expected: for @var in @collection => expression", "@", location());
    }

ForExpressionBody
  = "=>" _ expr:VarRHSContent { return expr; }
  / block:ForBlockAction { return block.statements; }

// LOOP EXPRESSION - loop(...) [ ... ]
LoopExpression "loop expression"
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

ForBatchPipeline "for batch pipeline"
  = _ "=>" _ "||" _ firstParallel:ParallelSequence rest:PipelineRest* caps:PipelineParallelSpec? {
      const pipeline = [[...firstParallel], ...rest];
      helpers.debug('ForBatchPipeline matched (parallel)', {
        stageCount: pipeline.length,
        hasCaps: !!caps
      });
      return {
        pipeline,
        isBatchPipeline: true,
        ...(caps ? { parallel: caps.parallel, delayMs: caps.delayMs } : {})
      };
    }
  / _ "=>" _ "|" _ firstStage:PipelineStageFirst rest:PipelineRest* {
      const pipeline = [firstStage, ...rest];
      helpers.debug('ForBatchPipeline matched', {
        stageCount: pipeline.length
      });
      return {
        pipeline,
        isBatchPipeline: true
      };
    }
