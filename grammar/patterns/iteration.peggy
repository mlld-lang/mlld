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

// Single action for for loops - uses unified effect actions
ForSingleAction "for action"
  // Support nested for directive (without slash) - creates a nested ForDirective
  = "for" _ pattern:ForIterationPattern _ "=>" _ action:ForSingleAction {
      helpers.debug('Nested for directive matched', { pattern, action });

      // Create a nested ForDirective node (not ForExpression)
      const nestedFor = helpers.createStructuredDirective(
        'for',
        'for',
        {
          variable: [pattern.variable],
          source: pattern.source,
          action: Array.isArray(action) ? action : [action]
        },
        {
          variable: pattern.variable.identifier,
          source: pattern.source,
          action: action
        },
        {
          hasVariables: true,
          actionType: 'single',
          isNested: true
        },
        location()
      );

      // Return as array for consistency with other actions
      return [nestedFor];
    }
  // Unified effect actions: show, log, output, append
  / effect:EffectAction {
      return Array.isArray(effect) ? effect : [effect];
    }
  // Variable assignment
  / directive:("var") _ content:VarRHSContent ending:StandardDirectiveEnding {
      // Create the action node; pass ending.tail so pipelines are embedded immutably
      return helpers.createForActionNode(directive, content, location(), ending ? ending.tail : null);
    }
  // Other when-style actions (including directives) directly in for loop bodies
  / whenAction:WhenRHSAction {
      return Array.isArray(whenAction) ? whenAction : [whenAction];
    }
  / invocation:UnifiedReferenceWithTail {
      // Follow the /when pattern - no @ consumption
      return [invocation];
    }

// Separator for block statements - disallow commas to avoid array confusion
BlockStatementSeparator
  = _ "," _ {
      helpers.mlldError(
        'Comma separators are not allowed in block statements. Use whitespace between statements.',
        "whitespace",
        location()
      );
    }
  / _

// Statement list for for-block bodies
ForBlockStatementList "for block statement list"
  = first:ForBlockStatement rest:(BlockStatementSeparator stmt:ForBlockStatement { return stmt; })* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt : [stmt];
      return [...normalize(first), ...rest.flatMap(normalize)];
    }

// Single statement inside a for block
ForBlockStatement "for block statement"
  = ForSingleAction

// Block action for /for directives and for-expressions
ForBlockAction "for block action"
  = "[" _ statements:ForBlockStatementList _ "]" {
      return {
        type: 'ForBlock',
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
        startRule: 'ForBlockStatementList',
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

// Action surface for exe for-expressions
ForExpressionAction "for expression action"
  = block:ForBlockAction { return block.statements; }
  / action:WhenRHSAction {
      return Array.isArray(action) ? action : [action];
    }
