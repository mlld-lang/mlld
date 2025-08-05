// VARIABLE ACCESS PATTERNS
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Variable types - the root rule used by other directives
Variable
  = SpecialVariable    // Check special vars first
  / InterpolationVar
  / AtVar

// Special variables - simple lowercase names
SpecialVariable "Special reserved variable"
  = "@" id:SpecialVariableName {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        isSpecial: true
      }, location());
    }

// Special variable names - all lowercase now
SpecialVariableName
  = "now" { return 'now'; }
  / "base" { return 'base'; }
  / "input" { return 'input'; }
  / "debug" { return 'debug'; }

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

// {{now}}, {{base}}, {{input}} - special variables in templates
InterpolationSpecialVar
  = "{{" _ id:SpecialVariableName format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        isSpecial: true,
        ...(format ? { format } : {})
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

// Variable with condensed pipes for interpolation contexts
VariableWithPipes "variable with optional pipes"
  = varRef:VariableNoTail pipes:CondensedPipeChain? {
      if (pipes && pipes.length > 0) {
        // Add pipes to the variable node
        return {
          ...varRef,
          pipes: pipes
        };
      }
      return varRef;
    }

// Template-specific variable pattern that doesn't check for tail modifiers
// Used in template contexts where keywords like "with" should be treated as literal text
TemplateVariableReference "variable reference in template context"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* pipes:CondensedPipeChain? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      if (pipes && pipes.length > 0) {
        return {
          ...varRef,
          pipes: pipes
        };
      }
      return varRef;
    }