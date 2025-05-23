// VARIABLE ACCESS PATTERNS
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Variable types - the root rule used by other directives
Variable
  = InterpolationVar
  / AtVar

// AtVar for direct variable references (using context detection)
// Used in paths, commands, and single bracket contexts
AtVar
  = "@" VariableContext id:BaseIdentifier accessElements:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(accessElements.length > 0 ? { fields: accessElements } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'AtVar', node, fields: accessElements });
      return node;
    }
  // Special case for top-level @var[...] without VariableContext check
  // This ensures we capture the full expression when it appears at the start
  / "@" id:BaseIdentifier &"[" accessElements:AnyFieldAccess+ {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        fields: accessElements
      }, location());
      helpers.debug('CreateVAR', { rule: 'AtVar with bracket', node, fields: accessElements });
      return node;
    }

// {{var}} syntax for interpolation in templates
InterpolationVar
  = InterpolationSimpleVar
  / InterpolationDataVar

// {{var}} for simple variable interpolation
InterpolationSimpleVar
  = "{{" _ id:BaseIdentifier format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationSimpleVar', node });
      return node;
    }

// {{var.field}} or {{var[index]}} for data field/array access
InterpolationDataVar
  = "{{" _ id:BaseIdentifier accessElements:AnyFieldAccess* format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        fields: accessElements || [],
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationDataVar', node });
      return node;
    }

// Legacy PathVar for backward compatibility during transition
// This will be removed after full implementation of AtVar
PathVar
  = "$" id:BaseIdentifier {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
      }, location());
      helpers.debug('CreateVAR', { rule: 'PathVar', node });
      return node;
    }

// Format specifiers for variables
VarFormat
  = ">>" format:BaseIdentifier {
      return format;
    }