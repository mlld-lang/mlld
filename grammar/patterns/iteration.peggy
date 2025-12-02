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
