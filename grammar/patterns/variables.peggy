// VARIABLE ACCESS PATTERNS
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Variable types - the root rule used by other directives
Variable
  = ReservedVariable
  / InterpolationVar
  / AtVar

// Reserved variables that have special meaning
ReservedVariable
  = "@TIME" {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'TIME',
        isReserved: true
      }, location());
    }
  / "@PROJECTPATH" {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'PROJECTPATH',
        isReserved: true
      }, location());
    }

// AtVar for direct variable references (using context detection)
// Used in paths, commands, and single bracket contexts
AtVar
  = "@" VariableContext id:FrontmatterAccess {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'frontmatter',
        fields: id.fields
      }, location());
    }
  / "@" VariableContext id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'AtVar', node, fields: fields });
      return node;
    }
  // Special case for top-level @var[...] without VariableContext check
  // This ensures we capture the full expression when it appears at the start
  / "@" id:BaseIdentifier &"[" fields:AnyFieldAccess+ {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        fields: fields
      }, location());
      helpers.debug('CreateVAR', { rule: 'AtVar with bracket', node, fields: fields });
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
  = "{{" _ id:BaseIdentifier fields:AnyFieldAccess* format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        fields: fields || [],
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationDataVar', node });
      return node;
    }


// Format specifiers for variables
VarFormat
  = ">>" format:BaseIdentifier {
      return format;
    }

// Frontmatter access patterns (fm.field or frontmatter.field)
FrontmatterAccess
  = ("frontmatter" / "fm") "." field:BaseIdentifier rest:AnyFieldAccess* {
      return {
        fields: [
          { type: 'dot', value: field },
          ...rest
        ]
      };
    }