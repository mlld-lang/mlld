// FOR DIRECTIVE
// Implementation of the /for directive for iteration

ForKeyword
  = "/"? "for"

SlashFor "for directive"
  = DirectiveContext ForKeyword opts:ForParallelSpec? _ pattern:ForIterationPattern _ "=>" _ action:ForSingleAction ending:StandardDirectiveEnding {
      helpers.debug('SlashFor matched', { pattern, action, ending });
      
      const meta = {
        hasVariables: true,
        actionType: 'single'
      };
      
      // Add comment from ending if present
      if (ending.comment) {
        meta.comment = ending.comment;
      }
      
      return helpers.createStructuredDirective(
        'for',
        'for', 
        {
          variable: [pattern.variable],
          source: pattern.source,
          action: Array.isArray(action) ? action : [action],
          forOptions: opts || undefined
        },
        {
          variable: helpers.reconstructRawString(pattern.variable),
          source: helpers.reconstructRawString(pattern.source),
          action: helpers.reconstructRawString(action)
        },
        meta,
        location()
      );
    }

  // Error recovery patterns
  / DirectiveContext ForKeyword _ pattern:ForIterationPattern _ !"=>" {
      helpers.mlldError("Missing '=>' in /for directive. Expected: /for @var in @collection => action", "=>", location());
    }
  / DirectiveContext ForKeyword _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in /for directive. Expected: /for @var in @collection => action", "in", location());
    }
  / DirectiveContext ForKeyword _ !"@" {
      helpers.mlldError("Invalid /for syntax. Expected: /for @var in @collection => action", "@", location());
    }
