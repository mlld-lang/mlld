// ITERATION PATTERNS
// Shared patterns for iteration constructs (for loops, etc.)

// For iteration pattern: @var in @collection (supports dotted field access)
ForIterationPattern "for iteration pattern"
  = variable:UnifiedVariableNoTail _ "in" _ source:VarRHSContent {
      return { 
        variable, 
        source: Array.isArray(source) ? source : [source]
      };
    }

// Optional parallel spec for /for and for-expressions
ForParallelSpec
  // New syntax: parallel(cap, pacing)
  = _ "parallel" _ "(" _ cap:NumberLiteral _ "," _ wait:TimeDurationLiteral _ ")" {
      const rateMs = helpers.ttlToSeconds(wait.value, wait.unit) * 1000;
      return { parallel: true, cap: Number(cap), rateMs };
    }
  // New syntax: parallel(cap)
  / _ "parallel" _ "(" _ cap:NumberLiteral _ ")" {
      return { parallel: true, cap: Number(cap) };
    }
  // New syntax: parallel()
  / _ "parallel" _ "(" _ ")" {
      return { parallel: true };
    }
  // New syntax: bare parallel
  / _ "parallel" {
      return { parallel: true };
    }
  // Legacy syntax: (cap, pacing) parallel
  / _ "(" _ cap:NumberLiteral _ "," _ wait:TimeDurationLiteral _ ")" _ "parallel" {
      helpers.warn(
        'Use parallel(cap, pacing) instead of (cap, pacing) parallel',
        'parallel(cap, pacing)',
        location(),
        'for-parallel-deprecated'
      );
      const rateMs = helpers.ttlToSeconds(wait.value, wait.unit) * 1000;
      return { parallel: true, cap: Number(cap), rateMs };
    }
  // Legacy syntax: cap parallel
  / _ cap:NumberLiteral _ "parallel" {
      helpers.warn(
        'Use parallel(cap) instead of cap parallel',
        'parallel(cap)',
        location(),
        'for-parallel-deprecated'
      );
      return { parallel: true, cap: Number(cap) };
    }

LoopLimit "loop limit"
  = endless:EndlessLiteral {
      return { kind: 'endless', value: 'endless', raw: 'endless' };
    }
  / cap:NumberLiteral {
      return { kind: 'number', value: Number(cap), raw: String(cap) };
    }
  / variable:UnifiedVariableNoTail {
      return {
        kind: 'variable',
        value: variable,
        raw: helpers.reconstructRawString(variable)
      };
    }

LoopHeader "loop header"
  = "(" _ limit:LoopLimit _ rate:("," _ wait:TimeDurationLiteral)? _ ")" {
      const wait = rate ? rate[2] : null;
      const rateMs = wait ? helpers.ttlToSeconds(wait.value, wait.unit) * 1000 : null;
      return {
        limit: limit.value,
        limitKind: limit.kind,
        rawLimit: limit.raw,
        rateMs,
        hasRate: rateMs !== null
      };
    }
  / "(" _ limit:LoopLimit _ "," _ !TimeDurationLiteral {
      helpers.mlldError(
        'Loop pacing expects a duration like 1s or 500ms.',
        '1s',
        location()
      );
    }
  / "(" _ ")" {
      helpers.mlldError(
        'loop() requires a limit or endless. Expected: loop(<cap>[, <rate>])',
        'loop(10)',
        location()
      );
    }

LoopUntilClause "loop until clause"
  = _ "until" _ condition:WhenConditionExpression {
      return condition;
    }

// Single action for for loops - uses unified effect actions
ForSingleAction "for action"
  // Nested for directive
  = ForNestedDirective
  // Unified effect actions: show, log, output, append
  / effect:EffectAction {
      return Array.isArray(effect) ? effect : [effect];
    }
  // Variable assignment
  / directive:("var") _ content:VarRHSContent ending:StandardDirectiveEnding {
      // Create the action node; pass ending.tail so pipelines are embedded immutably
      return helpers.createForActionNode(directive, content, location(), ending ? ending.tail : null, ending ? ending.comment : null);
    }
  / RunBlockAction
  // Other when-style actions (including directives) directly in for loop bodies
  / whenAction:WhenRHSAction {
      return Array.isArray(whenAction) ? whenAction : [whenAction];
    }
  / invocation:UnifiedReferenceWithTail {
      // Follow the /when pattern - no @ consumption
      return [invocation];
    }

// Nested for directive allowed inside block bodies (no leading slash)
ForNestedDirective
  = "for" opts:ForParallelSpec? _ pattern:ForIterationPattern _ actionVariant:ForActionVariant {
      helpers.debug('Nested for directive matched', { pattern, action: actionVariant });

      const meta = {
        hasVariables: true,
        actionType: actionVariant.actionType,
        isNested: true
      };

      if (actionVariant.blockMeta) {
        meta.block = actionVariant.blockMeta;
      }

      const normalizedAction = Array.isArray(actionVariant.action)
        ? actionVariant.action
        : [actionVariant.action];

      const nestedFor = helpers.createStructuredDirective(
        'for',
        'for',
        {
          variable: [pattern.variable],
          source: pattern.source,
          action: normalizedAction,
          forOptions: opts || undefined
        },
        {
          variable: helpers.reconstructRawString(pattern.variable),
          source: helpers.reconstructRawString(pattern.source),
          action: actionVariant.raw
        },
        meta,
        location()
      );

      // Return as array for consistency with other actions
      return [nestedFor];
    }

// Separator for block statements - disallow commas to avoid array confusion
BlockStatementSeparator
  = _ "," _ {
      helpers.mlldError(
        'Comma separators are not allowed in block statements. Use whitespace or semicolons between statements.',
        "whitespace",
        location()
      );
    }
  / _? BlockComments+ _
  / _ ";" _
  / _

// Statement list for for-block bodies
ForBlockStatementList "for block statement list"
  = leadingComments:LeadingBlockComment* _ first:ForBlockStatement rest:(BlockStatementSeparator stmt:ForBlockStatement { return stmt; })* trailing:BlockComments* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt : [stmt];
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

// Single statement inside a for block
ForBlockStatement "for block statement"
  = LetAssignment
  / AugmentedAssignment
  / WhenExpressionAny
  / ForNestedDirective
  / ForSingleAction

LoopBlockStatementList "loop block statement list"
  = leadingComments:LeadingBlockComment* _ first:LoopBlockStatement rest:(BlockStatementSeparator stmt:LoopBlockStatement { return stmt; })* trailing:BlockComments* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt : [stmt];
      const stmts = [...normalize(first), ...rest.flatMap(normalize)];
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

LoopBlockReturnStatement "loop block return statement"
  = "=>" _ {
      helpers.mlldError(
        'Return statements are not allowed in loop blocks. Use done or continue.',
        'done',
        location()
      );
    }

LoopBlockStatement "loop block statement"
  = LoopBlockReturnStatement
  / LetAssignment
  / AugmentedAssignment
  / DoneLiteral
  / ContinueLiteral
  / WhenExpressionAny
  / ForNestedDirective
  / ForSingleAction

ForBlockReturnStatement "for block return statement"
  = "=>" _ value:WhenRHSAction noise:BlockComments* {
      const normalized = Array.isArray(value) ? value.flat() : [value];
      return normalized;
    }

ForBlockBody "for block body"
  = statements:ForBlockStatementList firstReturn:(
      BlockStatementSeparator ret:ForBlockReturnStatement { return ret; }
    / _ ret:ForBlockReturnStatement { return ret; }
    )
    extraReturn:(BlockStatementSeparator ForBlockReturnStatement { return true; })?
    trailing:(BlockStatementSeparator ForBlockStatement { return true; })? {
      if (extraReturn) {
        helpers.mlldError(
          'Multiple return statements in for block. Only one return allowed as last statement.',
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
  / statements:ForBlockStatementList {
      return {
        statements,
        returnStmt: null
      };
    }
  / leadingComments:LeadingBlockComment* _ ret:ForBlockReturnStatement {
      return {
        statements: [],
        returnStmt: ret
      };
    }

LoopBlockBody "loop block body"
  = statements:LoopBlockStatementList {
      return {
        statements
      };
    }

// Block action for /for directives and for-expressions
ForBlockAction "for block action"
  = "[" _ body:ForBlockBody _ "]" {
      const statements = body.statements || [];
      const returnStmt = body.returnStmt;
      const hasReturn = Array.isArray(returnStmt) ? returnStmt.length > 0 : !!returnStmt;
      const mergedStatements = hasReturn ? [...statements, ...returnStmt] : statements;
      return {
        type: 'ForBlock',
        statements: mergedStatements,
        meta: {
          statementCount: statements.length,
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
        startRule: 'ForBlockBody',
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
        `Unterminated block in for action. Expected ']' to close the block.`,
        "]",
        location()
      );
    }

LoopBlockAction "loop block action"
  = "[" _ body:LoopBlockBody _ "]" {
      const statements = body.statements || [];
      return {
        type: 'LoopBlock',
        statements,
        meta: {
          statementCount: statements.length
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
        startRule: 'LoopBlockBody',
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
        `Unterminated block in loop action. Expected ']' to close the block.`,
        "]",
        location()
      );
    }

// Action variant for /for directives: single action or block
ForActionVariant "for action variant"
  = "=>" _ action:ForSingleAction {
      const normalized = Array.isArray(action) ? action : [action];
      return {
        action: normalized,
        actionType: 'single',
        raw: helpers.reconstructRawString(normalized)
      };
    }
  / "=>" _ block:ForBlockAction {
      const normalized = Array.isArray(block.statements) ? block.statements : [block.statements];
      return {
        action: normalized,
        actionType: 'block',
        raw: helpers.reconstructRawString(normalized),
        blockMeta: block.meta
      };
    }
  / block:ForBlockAction {
      const normalized = Array.isArray(block.statements) ? block.statements : [block.statements];
      return {
        action: normalized,
        actionType: 'block',
        raw: helpers.reconstructRawString(normalized),
        blockMeta: block.meta
      };
    }

// Action surface for exe for-expressions
ForExpressionAction "for expression action"
  = block:ForBlockAction { return block.statements; }
  / whenExpr:WhenExpressionAny { return [whenExpr]; }
  / action:WhenRHSAction {
      return Array.isArray(action) ? action : [action];
    }
