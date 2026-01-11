// FOR DIRECTIVE
// Implementation of the /for directive for iteration

ForKeyword
  = "/"? "for"

SlashFor "for directive"
  = DirectiveContext ForKeyword opts:ForParallelSpec? _ pattern:ForIterationPattern _ actionVariant:ForActionVariant ending:StandardDirectiveEnding {
      helpers.debug('SlashFor matched', { pattern, action: actionVariant, ending });
      
      const meta = {
        hasVariables: true,
        actionType: actionVariant.actionType
      };

      if (actionVariant.blockMeta) {
        meta.block = actionVariant.blockMeta;
      }
      
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
          action: actionVariant.action,
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
    }
  / DirectiveContext ForKeyword opts:ForParallelSpec? _ pattern:ForIterationPattern _ "[" {
      helpers.mlldError("Unterminated block. Expected ']' to close block.", "]", location());
    }

  // Error recovery patterns
  / DirectiveContext ForKeyword _ pattern:ForIterationPattern _ !"=>" {
      helpers.mlldError("Missing '=>' in for directive. Expected: for @var in @collection => action", "=>", location());
    }
  / DirectiveContext ForKeyword _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in for directive. Expected: for @var in @collection => action", "in", location());
    }
  / DirectiveContext ForKeyword _ !"@" {
      helpers.mlldError("Invalid for syntax. Expected: for @var in @collection => action", "@", location());
    }
