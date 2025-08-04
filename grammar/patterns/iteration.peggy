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
  = "/" directive:("show" / "var" / "output") _ content:VarRHSContent {
      return helpers.createForActionNode(directive, content, location());
    }
  / "@" invocation:UnifiedReferenceWithTail {
      // Implicit function call
      return [invocation];
    }