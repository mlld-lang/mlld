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
  // Special handling for /output directive with full source support via shared patterns
  = "/"? "output" _ source:OutputSource? _ "to" _ target:OutputTarget {
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
  // Generic handling for other directives (with optional /)
  / "/"? directive:("show" / "var") _ content:VarRHSContent {
      return helpers.createForActionNode(directive, content, location());
    }
  / invocation:UnifiedReferenceWithTail {
      // Follow the /when pattern - no @ consumption
      return [invocation];
    }