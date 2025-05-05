// VARIABLE ACCESS PATTERNS
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

// Variable types - the root rule used by other directives
Variable
  = InterpolationVar
  / AtVar

// AtVar for direct variable references (uses @var syntax)
// Used in paths, commands, and single bracket contexts
AtVar
  = "@" !{
      // Don't match if we're at a directive keyword
      const directiveKeywords = ['path', 'text', 'run', 'import', 'data', 'exec', 'add'];
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos - 1); // -1 because we've already matched @
      
      if (!isAtLineStart) return false; // Not at line start, so can't be a directive
      
      // Look ahead to see if we have a directive keyword after the @
      const nextText = input.substring(pos, pos + 10); // Max directive keyword length + space
      for (const keyword of directiveKeywords) {
        if (nextText.startsWith(keyword) && 
            (nextText.length === keyword.length || /\s/.test(nextText[keyword.length]))) {
          return true; // This is a directive, don't match as AtVar
        }
      }
      return false;
    } id:(SpecialPathChar / Identifier) {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
      }, location());
      helpers.debug('CreateVAR', { rule: 'AtVar', node });
      return node;
    }

// {{var}} syntax for interpolation in templates
InterpolationVar
  = InterpolationSimpleVar
  / InterpolationDataVar

// {{var}} for simple variable interpolation
InterpolationSimpleVar
  = "{{" _ id:Identifier format:VarFormat? _ "}}" {
      const node = helpers.createVariableReferenceNode('varInterpolation', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'InterpolationSimpleVar', node });
      return node;
    }

// {{var.field}} or {{var[index]}} for data field/array access
InterpolationDataVar
  = "{{" _ id:Identifier accessElements:(FieldAccess / NumericFieldAccess / ArrayAccess)* format:VarFormat? _ "}}" {
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
  = "$" id:(SpecialPathChar / Identifier) {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
      }, location());
      helpers.debug('CreateVAR', { rule: 'PathVar', node });
      return node;
    }

// Format specifiers for variables
VarFormat
  = ">>" format:Identifier {
      return format;
    }