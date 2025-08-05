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
  // Special handling for /output directive with its specific syntax (with optional /)
  = "/"? "output" _ source:ForOutputSource? _ "to" _ target:ForOutputTarget {
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

// Output source for for loop actions
ForOutputSource
  = "@" varRef:BaseIdentifier {
      return {
        type: 'variable',
        values: {
          identifier: [helpers.createVariableReferenceNode('varIdentifier', {
            identifier: varRef
          }, location())],
          args: []
        },
        raw: {
          identifier: varRef
        }
      };
    }

// Output target for for loop actions  
ForOutputTarget
  = "stdout" {
      return {
        type: 'stream',
        stream: 'stdout',
        raw: 'stdout'
      };
    }
  / "stderr" {
      return {
        type: 'stream', 
        stream: 'stderr',
        raw: 'stderr'
      };
    }
  / str:DataString {
      // Quoted file path - handle both simple strings and interpolated content
      let pathNodes;
      let rawString;
      let needsInterpolation = false;
      
      if (typeof str === 'string') {
        // Simple string without interpolation
        pathNodes = [helpers.createNode(NodeType.Text, { content: str, location: location() })];
        rawString = str;
      } else if (str.needsInterpolation) {
        // Complex string with interpolation
        pathNodes = str.parts;
        needsInterpolation = true;
        // Reconstruct raw string from parts
        rawString = str.parts.map(part => {
          if (part.type === 'Text') return part.content;
          if (part.type === 'VariableReference') return '@' + part.identifier;
          return '';
        }).join('');
      }
      
      return {
        type: 'file',
        path: pathNodes,
        raw: rawString,
        meta: { 
          quoted: true,
          needsInterpolation: needsInterpolation
        }
      };
    }