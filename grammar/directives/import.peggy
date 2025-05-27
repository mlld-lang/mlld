// IMPORT DIRECTIVE
// Implementation of the @import directive for importing values from other Mlld files

/* 
# Import Directive

The import directive brings in variables from other Mlld files.
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
  = DirectiveContext "@import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:PathExpression {
      helpers.debug('AtImport matched', { imports, path });
      
      // Get the raw imports text
      const importsRaw = imports.map(item => {
        if (typeof item === 'string') {
          return item;
        } else if (item.type === 'namespace') {
          return `* as ${item.alias}`;
        } else {
          return `${item.original} as ${item.alias}`;
        }
      }).join(", ");
      
      // Determine subtype (importAll, importNamespace, or importSelected)
      let subtype;
      if (imports.length === 1) {
        if (imports[0] === '*') {
          subtype = 'importAll';
        } else if (imports[0].type === 'namespace') {
          subtype = 'importNamespace';
        } else {
          subtype = 'importSelected';
        }
      } else {
        subtype = 'importSelected';
      }
      
      // Create values object with variable references
      const values = {
        imports: imports.map(item => {
          if (typeof item === 'string') {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item
            });
          } else if (item.type === 'namespace') {
            return helpers.createVariableReferenceNode('import', { 
              identifier: '*',
              alias: item.alias
            });
          } else {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item.original,
              alias: item.alias
            });
          }
        }),
        path: path.values.path || path.values.url // Handle both file and URL paths
      };
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw,
        path: path.raw.path || path.raw.url // Handle both file and URL paths
      };
      
      // Create meta object with path metadata
      const meta = {
        path: {
          // Include all relevant path metadata
          ...path.meta,
          pathSubtype: path.subtype // Preserve the specific path type
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

// Using standard list pattern from patterns/lists.peggy
ImportsList
  = "*" alias:(" as " aliasName:BaseIdentifier { return aliasName; })? {
      if (alias) {
        return [{ type: 'namespace', alias: alias }];
      }
      return ["*"];
    }
  / first:ImportItem rest:(CommaSpace item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

// Individual import item with optional alias
ImportItem
  = name:BaseIdentifier alias:(" as " aliasName:BaseIdentifier { return aliasName; })? {
      if (alias) {
        return { original: name, alias: alias };
      }
      return name;
    }