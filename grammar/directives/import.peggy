// IMPORT DIRECTIVE
// Implementation of the @import directive for importing values from other Meld files

/* 
# Import Directive

The import directive brings in variables from other Meld files.
It can be used in these forms:
1. @import {var1, var2} from "path/to/file"  - Import specific variables
2. @import {var1 as alias} from "path/to/file" - Import with alias
3. @import {*} from "path/to/file"          - Import all variables
*/

// Import context predicates and core content handlers
import './base/context.peggy';
import './base/tokens.peggy';
import './base/whitespace.peggy';
import './patterns/variables.peggy';
import './core/path.peggy';

// -------------------------------------------------------------
// TOP-LEVEL IMPORT DIRECTIVE
// -------------------------------------------------------------

// Primary @import directive
AtImport
  = "@import" DirectiveContext _ "{" _ imports:ImportsList _ "}" _ "from" _ path:PathCore {
      helpers.debug('AtImport matched', { imports, path });
      
      // Get the raw imports text
      const importsRaw = imports.map(item => 
        item.alias ? `${item.name} as ${item.alias}` : item.name
      ).join(", ");
      
      // Determine subtype (importAll or importSelected)
      const subtype = imports.length === 1 && imports[0].name === '*' ? 
                     'importAll' : 'importSelected';
      
      // Create values object with variable references
      const values = {
        imports: imports.map(item => helpers.createVariableReferenceNode('import', { 
          identifier: item.name,
          alias: item.alias || null
        })),
        path: path.values.path
      };
      
      // Create raw object with text segments
      const raw = {
        imports: imports.length === 1 && imports[0].name === '*' ? '*' : importsRaw,
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
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Import list parsing
ImportsList
  = "*" {
      return [{name: "*", alias: null}];
    }
  / first:ImportItem rest:(_ "," _ item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

// Individual import item
ImportItem
  = name:BaseIdentifier _ "as" _ alias:BaseIdentifier { 
      return {name, alias};
    }
  / name:BaseIdentifier { 
      return {name, alias: null};
    }