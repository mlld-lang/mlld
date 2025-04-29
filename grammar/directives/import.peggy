
ImportDirective_Simple
  = _ "import" _ pathParts:PathValue _ { // Changed path to pathParts
    // REMOVED: helpers.debug('IMPORT_BRACKET_PATH_RECEIVED_PARTS', 'Received parts:', JSON.stringify(pathParts)); // <<< ADDED DEBUG LOG
    const pathData = helpers.validatePath(pathParts); // Pass parts directly
    // UPDATED: Explicitly set subtype (Task 3.2)
    return helpers.createDirective('import', { subtype: helpers.getImportSubtype([]), path: pathData, imports: undefined }, location());
  }

ImportDirective_WithClause
  = "import" _ "[" _ imports:ImportsList _ "]" _ "from" _ "[" pathParts:BracketInterpolatableContentOrEmpty "]" HWS DirectiveEOL {
      const validatedPath = helpers.validatePath(pathParts);
      const directiveData = {
        subtype: helpers.getImportSubtype(imports),
        path: validatedPath,
        imports: imports
      };
      return helpers.createDirective('import', directiveData, location());
    }
  / "import" _ "[" _ imports:ImportsList _ "]" _ "from" __ variable:Variable HWS DirectiveEOL {
    const validatedPath = helpers.validatePath([variable]);
    const directiveData = {
      subtype: helpers.getImportSubtype(imports),
      path: validatedPath,
      imports: imports
    };
    return helpers.createDirective('import', directiveData, location());
  }
  / // Traditional import (backward compatibility)
    "import" _ "[" pathParts:BracketInterpolatableContentOrEmpty "]" DirectiveEOL {
      // REMOVED: helpers.debug('IMPORT_BRACKET_PATH_RECEIVED_PARTS', 'Received parts:', JSON.stringify(pathParts)); // <<< ADDED DEBUG LOG
      const validatedPath = helpers.validatePath(pathParts);
      const implicitImports = [{name: "*", alias: null}];
      const directiveData = {
        subtype: helpers.getImportSubtype(implicitImports),
        path: validatedPath,
        imports: implicitImports
      };
      return helpers.createDirective('import', directiveData, location());
    }
  / // Traditional import with variable (backward compatibility)
    "import" __ variable:Variable DirectiveEOL {
      const validatedPath = helpers.validatePath([variable]);
      const implicitImports = [{name: "*", alias: null}];
      const directiveData = {
        subtype: helpers.getImportSubtype(implicitImports),
        path: validatedPath,
        imports: implicitImports
      };
      return helpers.createDirective('import', directiveData, location());
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

ImportAlias
  = _ "as" _ alias:Identifier {
      return alias;
    }

IdentifierList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }

ImportPathOrBracketed
  = UnquotedImportPath
  / ('[' _ path:BracketInterpolatableContentOrEmpty _ ']') // MODIFIED: Use new unified rule

// Matches an unquoted path for import directives
UnquotedImportPath
  = chars:[^ \t\r\n\u200B\u200C\u200D]+ { return chars.join(''); }


// +++ DECOMPOSED IMPORT RULES FOR LOGGING +++

_ImportKeyword
  = "import" { helpers.debug('Import Trace: Matched \"import\"'); return true; }

_ImportMandatoryWhitespace
  = __ { helpers.debug('Import Trace: Matched __'); return true; }

_ImportOpeningBracket
  = "[" { helpers.debug('Import Trace: Matched \"[\"'); return true; }

_ImportPathContent
  = pathParts:BracketInterpolatableContentOrEmpty { helpers.debug('Import Trace: Matched pathParts', `length=${pathParts.length}`); return pathParts; } // Return the matched parts

_ImportClosingBracket
  = "]" { helpers.debug('Import Trace: Matched \"\"]\"'); return true; }

_ImportEnd
  = ContentEOL { helpers.debug('Import Trace: Matched End'); return true; }
