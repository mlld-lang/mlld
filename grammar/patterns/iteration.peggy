// ITERATION PATTERNS
// Shared patterns for iteration constructs (for loops, etc.)

// For iteration pattern: @var in @collection
ForIterationPattern "for iteration pattern"
  = "@" variable:BaseIdentifier _ "in" _ source:VarRHSContent {
      const varNode = helpers.createVariableReferenceNode('varIdentifier', { 
        identifier: variable 
      }, location());
      
      return { 
        variable: varNode, 
        source: Array.isArray(source) ? source : [source]
      };
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
  / "show" _ content:(UnifiedQuoteOrTemplate / UnifiedReferenceWithTail) ending:StandardDirectiveEnding {
      // Support both template/quote content and unified references for show actions
      // Pass along any tail pipeline from the standard directive ending
      return helpers.createForActionNode('show', content, location(), ending ? ending.tail : null);
    }
  / directive:("var") _ content:VarRHSContent ending:StandardDirectiveEnding {
      // Create the action node; pass ending.tail so pipelines are embedded immutably
      return helpers.createForActionNode(directive, content, location(), ending ? ending.tail : null);
    }
  / invocation:UnifiedReferenceWithTail {
      // Follow the /when pattern - no @ consumption
      return [invocation];
    }
