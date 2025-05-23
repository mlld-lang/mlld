// IMPORT DIRECTIVE
// Implementation of the @import directive for importing values from other Meld files

/* 
# Import Directive

The import directive brings in variables from other Meld files.
It can be used in these forms:
1. @import {var1, var2} from "path/to/file"  - Import specific variables
2. @import {*} from "path/to/file"          - Import all variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL IMPORT DIRECTIVE
// -------------------------------------------------------------

// Primary @import directive
AtImport
  = DirectiveContext "@import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:PathCore {
      helpers.debug('AtImport matched', { imports, path });
      
      // Get the raw imports text
      const importsRaw = imports.join(", ");
      
      // Determine subtype (importAll or importSelected)
      const subtype = imports.length === 1 && imports[0] === '*' ? 
                     'importAll' : 'importSelected';
      
      // Create values object with variable references
      const values = {
        imports: imports.map(item => helpers.createVariableReferenceNode('import', { 
          identifier: item
        })),
        path: path.values.path
      };
      
      // Create raw object with text segments
      const raw = {
        imports: imports.length === 1 && imports[0] === '*' ? '*' : importsRaw,
        path: path.raw.path
      };
      
      // Create meta object with path metadata
      const meta = {
        path: {
          hasVariables: path.meta.hasVariables,
          isAbsolute: path.meta.isAbsolute,
          hasExtension: path.meta.hasExtension,
          extension: path.meta.extension
        }
      };
      
      return helpers.createStructuredDirective(
        'import',
        subtype,
        values,
        raw,
        meta,
        location(),
        'path'  // Source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

ImportsList
  = "*" {
      return ["*"];
    }
  / first:ImportItem rest:(_ "," _ item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

// Individual import item
ImportItem
  = name:BaseIdentifier { 
      return name;
    }