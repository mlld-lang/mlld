// VARIABLE ACCESS PATTERNS
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Variable types - the root rule used by other directives
Variable
  = SpecialVariable    // Check special vars first (includes @., case-insensitive forms)
  / InterpolationVar
  / AtVar

// Special variables with case insensitivity and special forms
SpecialVariable "Special reserved variable"
  = "@." {
      // @. is always PROJECTPATH
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'PROJECTPATH',
        isSpecial: true,
        originalForm: '@.'
      }, location());
    }
  / "@" id:SpecialVariableName {
      // Normalize to uppercase and handle deprecations
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id.normalized,
        isSpecial: true,
        originalCase: id.original,
        ...(id.deprecated ? { deprecated: true } : {})
      }, location());
    }

// Special variable names with case insensitive matching
SpecialVariableName
  = id:CaseInsensitiveTime { return { original: id, normalized: 'TIME' }; }
  / id:CaseInsensitiveProjectPath { return { original: id, normalized: 'PROJECTPATH' }; }
  / id:CaseInsensitiveInput { return { original: id, normalized: 'INPUT' }; }
  / id:CaseInsensitiveDebug { return { original: id, normalized: 'DEBUG' }; }
  / id:CaseInsensitiveStdin { return { original: id, normalized: 'INPUT', deprecated: true }; }

// Case insensitive matchers for special variables
CaseInsensitiveTime
  = chars:([Tt] [Ii] [Mm] [Ee]) { return chars.join(''); }

CaseInsensitiveProjectPath
  = chars:([Pp] [Rr] [Oo] [Jj] [Ee] [Cc] [Tt] [Pp] [Aa] [Tt] [Hh]) { return chars.join(''); }

CaseInsensitiveInput
  = chars:([Ii] [Nn] [Pp] [Uu] [Tt]) { return chars.join(''); }

CaseInsensitiveDebug
  = chars:([Dd] [Ee] [Bb] [Uu] [Gg]) { return chars.join(''); }

CaseInsensitiveStdin
  = chars:([Ss] [Tt] [Dd] [Ii] [Nn]) { return chars.join(''); }

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
  = InterpolationSpecialVar
  / InterpolationSimpleVar
  / InterpolationDataVar

// {{TIME}}, {{PROJECTPATH}}, {{INPUT}} - special variables in templates
InterpolationSpecialVar
  = "{{" _ id:SpecialVariableName format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id.normalized,
        isSpecial: true,
        originalCase: id.original,
        ...(format ? { format } : {}),
        ...(id.deprecated ? { deprecated: true } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationSpecialVar', node });
      return node;
    }

// {{var}} for simple variable interpolation
InterpolationSimpleVar
  = "{{" _ id:BaseIdentifier format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationSimpleVar', node });
      return node;
    }

// {{var.field}} or {{var[index]}} for data field/array access
InterpolationDataVar
  = "{{" _ id:BaseIdentifier fields:AnyFieldAccess* format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varIdentifier', {
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

// Variable reference with optional tail modifiers (for pipeline support)
VariableReferenceWithTail "variable reference with tail modifiers"
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* _ tail:TailModifiers? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      if (tail) {
        // Wrap in a structure similar to ExecInvocation for consistency
        return {
          type: 'VariableReferenceWithTail',
          variable: varRef,
          withClause: tail
        };
      }
      
      // No tail modifiers - return plain variable reference
      return varRef;
    }