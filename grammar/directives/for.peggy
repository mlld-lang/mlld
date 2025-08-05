// FOR DIRECTIVE
// Implementation of the /for directive for iteration

SlashFor "for directive"
  = DirectiveContext "/for" _ pattern:ForIterationPattern _ "=>" _ action:ForSingleAction ending:StandardDirectiveEnding {
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
          action: Array.isArray(action) ? action : [action]
        },
        {
          variable: pattern.variable.identifier,
          source: helpers.reconstructRawString(pattern.source),
          action: helpers.reconstructRawString(action)
        },
        meta,
        location()
      );
    }

  // Error recovery patterns
  / DirectiveContext "/for" _ pattern:ForIterationPattern _ !"=>" {
      helpers.mlldError("Missing '=>' in /for directive. Expected: /for @var in @collection => action", "=>", location());
    }
  / DirectiveContext "/for" _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in /for directive. Expected: /for @var in @collection => action", "in", location());
    }
  / DirectiveContext "/for" _ !"@" {
      helpers.mlldError("Invalid /for syntax. Expected: /for @var in @collection => action", "@", location());
    }