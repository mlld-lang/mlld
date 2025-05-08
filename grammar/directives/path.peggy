// PATH DIRECTIVE
// Implementation of the @path directive for defining path variables

/* 
# Path Directive

The path directive defines path variables that can include interpolated variables.
It is used in the form:
@path identifier = "path/to/something"
@path identifier = path/with/@variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL PATH DIRECTIVE
// -------------------------------------------------------------

// Primary @path directive
AtPath
  = DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ path:PathCore {
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
        location(),
        'path'  // Added source parameter
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