ImportDirective
  = "@import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:(
      quotedPath:StringLiteral { 
        return { 
          parts: quotedPath,
          raw: $(quotedPath)
        };
      }
      / variablePath:Variable {
        return {
          parts: [variablePath],
          raw: $(variablePath)
        };
      }
    ) HWS DirectiveEOL {
      // Get the raw imports text
      const importsRaw = imports.map(item => 
        item.alias ? `${item.name.identifier} as ${item.alias.identifier}` : item.name.identifier
      ).join(", ");
      
      // Process the path
      const validatedPath = helpers.validatePath(path.parts);
      const subtype = helpers.getImportSubtype(imports);
      
      // Create values object with node arrays
      const values = {
        imports: imports.map(item => helpers.createVariableReferenceNode('import', { 
          identifier: item.name.identifier,
          alias: item.alias ? item.alias.identifier : null
        })),
        path: validatedPath.values
      };
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw,
        path: path.raw
      };
      
      // Create meta object with nested path metadata
      const meta = {
        path: validatedPath.path
      };
      
      return helpers.createStructuredDirective('import', subtype, values, raw, meta, location());
    }

// Rules for parsing import lists
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

ImportItem
  = name:Identifier _ "as" _ alias:Identifier { // Explicitly match 'name as alias'
      return {name, alias: alias};
    }
  / name:Identifier { // Fallback for 'name' without alias
      return {name, alias: null};
    }