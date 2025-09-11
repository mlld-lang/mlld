// UNIFIED VARIABLE ACCESS PATTERNS
// This file defines unified patterns for variable references across all contexts.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Unified variable types - the root rule used by other directives
UnifiedVariable
  = UnifiedSpecialVariable
  / UnifiedAtVar

// Unified special variables - allow field access
UnifiedSpecialVariable "Special reserved variable"
  = "@" id:UnifiedSpecialVariableName fields:AnyFieldAccess* {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        isSpecial: true,
        ...(fields.length > 0 ? { fields } : {})
      }, location());
    }

// Unified special variable names - all lowercase now
UnifiedSpecialVariableName
  = "now" { return 'now'; }
  / "base" { return 'base'; }
  / "input" { return 'input'; }
  / "debug" { return 'debug'; }
  / "pipeline" { return 'pipeline' ; }

// UnifiedAtVar for direct variable references (using context detection)
// Used in paths, commands, and single bracket contexts
UnifiedAtVar
  = "@" VariableContext id:UnifiedFrontmatterAccess {
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
      helpers.debug('CreateVAR', { rule: 'UnifiedAtVar', node, fields: fields });
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
      helpers.debug('CreateVAR', { rule: 'UnifiedAtVar with bracket', node, fields: fields });
      return node;
    }

// {{var}} syntax for interpolation in templates
UnifiedInterpolationVar
  = UnifiedInterpolationSpecialVar
  / UnifiedInterpolationSimpleVar
  / UnifiedInterpolationDataVar

// {{now}}, {{base}}, {{input}} - special variables in templates with field access
UnifiedInterpolationSpecialVar
  = "{{" _ id:UnifiedSpecialVariableName fields:AnyFieldAccess* format:UnifiedVarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        isSpecial: true,
        ...(fields.length > 0 ? { fields } : {}),
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'UnifiedInterpolationSpecialVar', node });
      return node;
    }

// {{var}} for simple variable interpolation
UnifiedInterpolationSimpleVar
  = "{{" _ id:BaseIdentifier format:UnifiedVarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'UnifiedInterpolationSimpleVar', node });
      return node;
    }

// {{var.field}} or {{var[index]}} for data field/array access
UnifiedInterpolationDataVar
  = "{{" _ id:BaseIdentifier fields:AnyFieldAccess* format:UnifiedVarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        fields: fields || [],
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'UnifiedInterpolationDataVar', node });
      return node;
    }


// Format specifiers for variables
UnifiedVarFormat
  = ">>" format:BaseIdentifier {
      return format;
    }

// Frontmatter access patterns (fm.field or frontmatter.field)
UnifiedFrontmatterAccess
  = ("frontmatter" / "fm") "." field:BaseIdentifier rest:AnyFieldAccess* {
      return {
        fields: [
          { type: 'dot', value: field },
          ...rest
        ]
      };
    }

// Unified variable reference with optional tail modifiers (for pipeline support)
UnifiedVariableReferenceWithTail "variable reference with tail modifiers"
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* _ tail:TailModifiers? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      if (tail) {
        // Wrap in a structure similar to ExecInvocation for consistency
        return {
          type: 'UnifiedVariableReferenceWithTail',
          variable: varRef,
          withClause: tail
        };
      }
      
      // No tail modifiers - return plain variable reference
      return varRef;
    }

// Unified variable reference without tail modifiers
UnifiedVariableNoTail "variable reference without tail modifiers"
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* !TailModifiers {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// Unified variable with condensed pipes for interpolation contexts
UnifiedVariableWithPipes "variable with optional pipes"
  = varRef:UnifiedVariableNoTail pipes:TemplatePipeChain? {
      if (pipes && pipes.length > 0) {
        // Add pipes to the variable node
        return {
          ...varRef,
          pipes: pipes
        };
      }
      return varRef;
    }

// Unified template-specific variable pattern that doesn't check for tail modifiers
// Used in template contexts where keywords like "with" should be treated as literal text
// Handles backslash as a boundary marker: @var\ stops variable, @var\\ includes literal \
UnifiedTemplateVariableReference "variable reference in template context"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* boundary:VariableBoundary? pipes:TemplatePipeChain? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {}),
        ...(boundary ? { boundary: boundary } : {})
      }, location());
      
      if (pipes && pipes.length > 0) {
        return {
          ...varRef,
          pipes: pipes
        };
      }
      return varRef;
    }

// Variable boundary pattern - handles backslash escape for disambiguation
// Single \ is consumed as boundary, double \\ produces literal \
VariableBoundary "variable boundary"
  = "\\\\" { return { type: 'literal', value: '\\' }; }  // Double backslash -> literal
  / "\\" !"\\" { return { type: 'consumed' }; }           // Single backslash -> boundary only
