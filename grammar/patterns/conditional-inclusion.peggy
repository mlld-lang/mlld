// CONDITIONAL VARIABLE REFERENCE - @var? with field access

ConditionalVariableReference
  = "@" id:BaseIdentifier fields:AnyFieldAccess* "?" {
      const normalizedId = helpers.normalizePathVar(id);
      return {
        type: 'ConditionalVarRef',
        variable: helpers.createVariableReferenceNode('varIdentifier', {
          identifier: normalizedId,
          ...(fields.length > 0 ? { fields } : {})
        }, location())
      };
    }

// CONDITIONAL VARIABLE OMISSION - @var? standalone (no coalesce)
ConditionalVariableOmission "conditional variable omission"
  = condition:ConditionalVariableReference !"?" {
      return {
        type: 'ConditionalVarOmission',
        variable: condition.variable,
        location: location()
      };
    }

// TIGHT NULL COALESCING - @var??"default" (template contexts only)
NullCoalescingTight "tight null coalescing"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* "??" fallback:(
      '"' content:EscapedStringContent '"' {
        return { type: 'string', quote: 'double', value: content };
      }
    / "'" content:EscapedSingleStringContent "'" {
        return { type: 'string', quote: 'single', value: content };
      }
    ) {
      const normalizedId = helpers.normalizePathVar(id);
      return {
        type: 'NullCoalescingTight',
        variable: helpers.createVariableReferenceNode('varIdentifier', {
          identifier: normalizedId,
          ...(fields.length > 0 ? { fields } : {})
        }, location()),
        default: fallback,
        location: location()
      };
    }
