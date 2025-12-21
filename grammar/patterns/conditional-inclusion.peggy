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
