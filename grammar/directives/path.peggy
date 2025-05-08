// PATH DIRECTIVE
// Implementation of the @path directive for defining path variables

/* 
# Path Directive

The path directive defines path variables that can include interpolated variables.
It is used in the form:
@path identifier = "path/to/something"
@path identifier = path/with/@variables
*/

// Import context predicates and core content handlers
import './base/context.peggy';
import './base/tokens.peggy';
import './base/whitespace.peggy';
import './patterns/variables.peggy';
import './core/path.peggy';

// -------------------------------------------------------------
// TOP-LEVEL PATH DIRECTIVE
// -------------------------------------------------------------

// Primary @path directive
AtPath
  = "@path" DirectiveContext _ id:BaseIdentifier _ "=" _ path:PathCore {
      helpers.debug('AtPath matched', { id, path });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: path.values.path
        },
        {
          identifier: id,
          path: path.raw.path
        },
        {
          path: {
            hasVariables: path.meta.hasVariables,
            isAbsolute: path.meta.isAbsolute,
            hasExtension: path.meta.hasExtension,
            extension: path.meta.extension
          }
        },
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES (special path identifiers)
// -------------------------------------------------------------

// Special path identifiers (HOMEPATH, PROJECTPATH, etc.)
SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
      return text();
    }