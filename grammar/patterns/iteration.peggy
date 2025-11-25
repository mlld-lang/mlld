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

// Single action for for loops - simpler than WhenAction
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
  // Special handling for /output directive with full source support via shared patterns
  / "output" _ source:OutputSource? _ "to" _ target:OutputTarget {
      const values = {
        target: target
      };
      
      const raw = {
        target: target.raw
      };
      
      let subtype = 'outputDocument';
      const meta = { 
        hasSource: false,
        targetType: target.type
      };
      
      if (source) {
        values.source = source.values;
        raw.source = source.raw;
        meta.hasSource = true;
        meta.sourceType = source.type;
        subtype = 'outputFile';
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }
  // Support for /append directive inside /for actions
  / "append" _ source:OutputSource _ "to" _ target:OutputTargetFile format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      const values = {
        source: source.values,
        target
      };

      const raw = {
        source: source.raw,
        target: target.raw
      };

      const meta = {
        sourceType: source.type,
        targetType: 'file',
        hasSource: true,
        ...(format ? { format, explicitFormat: true } : {})
      };

      helpers.processPipelineEnding(values, raw, meta, ending);

      return [helpers.createStructuredDirective(
        'append',
        'appendFile',
        values,
        raw,
        meta,
        location()
      )];
    }
  // Special handling for /log directive - syntactic sugar for output to stderr
  / "log" _ source:OutputSource? {
      // Create stdout target automatically (same as /log directive)
      const stdoutTarget = {
        type: 'stream',
        stream: 'stderr',
        raw: 'stderr'
      };
      
      const values = {
        target: stdoutTarget
      };
      
      const raw = {
        target: 'stderr'
      };
      
      let subtype = 'outputStream';
      const meta = { 
        hasSource: false,
        targetType: 'stream',
        isLogSugar: true  // Mark for debugging/tracing
      };
      
      if (source) {
        values.source = source.values;
        raw.source = source.raw;
        meta.hasSource = true;
        meta.sourceType = source.type;
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'output',  // CRITICAL: Use 'output' kind, not 'log'
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }
  // Generic handling for other directives (with optional /)
  / "show" _ content:WhenRHSShowContent ending:StandardDirectiveEnding {
      // Support both template/quote content and unified references for show actions
      // Pass along any tail pipeline from the standard directive ending
      return helpers.createForActionNode('show', content, location(), ending ? ending.tail : null);
    }
  / directive:("var") _ content:VarRHSContent ending:StandardDirectiveEnding {
      // Create the action node; pass ending.tail so pipelines are embedded immutably
      return helpers.createForActionNode(directive, content, location(), ending ? ending.tail : null);
    }
  / whenAction:WhenRHSAction {
      // Allow when-style actions (including directives) directly in for loop bodies
      return Array.isArray(whenAction) ? whenAction : [whenAction];
    }
  / invocation:UnifiedReferenceWithTail {
      // Follow the /when pattern - no @ consumption
      return [invocation];
    }
