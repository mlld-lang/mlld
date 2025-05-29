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
  = AtImportShorthand
  / AtImportFull

// Shorthand import: @import [path] or @import @stdin
AtImportShorthand
  = DirectiveContext "@import" _ path:ImportPath {
      helpers.debug('AtImportShorthand matched', { path });
      
      // Shorthand always imports all (*)
      const imports = ["*"];
      const importsRaw = "*";
      
      // Create values object with variable references
      const values = {
        imports: [helpers.createVariableReferenceNode('import', { 
          identifier: '*'
        })],
        path: path.values?.path || path.raw?.path || path // Handle different path formats
      };
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw,
        path: path.raw?.path || path // Handle string paths like @stdin
      };
      
      // Create meta object with path metadata
      const meta = {
        path: path.meta || {}
      };
      
      return helpers.createStructuredDirective(
        'import',
        'importAll',
        values,
        raw,
        meta,
        location(),
        'path'
      );
    }

// Full import with explicit imports list
AtImportFull
  = DirectiveContext "@import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:ImportPath {
      helpers.debug('AtImport matched', { imports, path });
      
      // Get the raw imports text
      const importsRaw = imports.map(item => {
        if (typeof item === 'string') {
          return item;
        } else {
          return `${item.original} as ${item.alias}`;
        }
      }).join(", ");
      
      // Determine subtype (importAll or importSelected)
      let subtype;
      if (imports.length === 1 && imports[0] === '*') {
        subtype = 'importAll';
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
          } else {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item.original,
              alias: item.alias
            });
          }
        }),
        path: path.values?.path || path.values?.url || path // Handle both file and URL paths and string paths
      };
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw,
        path: path.raw?.path || path.raw?.url || path // Handle both file and URL paths and string paths
      };
      
      // Create meta object with path metadata
      const meta = {
        path: path.meta || { 
          isSpecial: typeof path === 'string',
          pathSubtype: path.subtype 
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

// Import path - handles special @stdin source and regular paths
ImportPath
  = "@stdin" {
      helpers.debug('ImportPath matched @stdin');
      return {
        type: 'path',
        subtype: 'stdinPath',
        values: { 
          path: '@stdin'
        },
        raw: { 
          path: '@stdin'
        },
        meta: {
          isSpecial: true,
          source: 'stdin'
        }
      };
    }
  / PathExpression

// Using standard list pattern from patterns/lists.peggy
ImportsList
  = "*" {
      // * means import all variables with their original names - cannot be aliased
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