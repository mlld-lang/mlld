
ImportDirective_Simple
  = _ "import" _ pathValue:(pathParts:PathValue &{return true;} pathRaw:$([]) {return {pathParts, pathRaw: input.substring(peg$currPos - input.match(/[^\s]+$/)[0].length, peg$currPos)};}) _ { 
    const {pathParts, pathRaw} = pathValue;
    const pathData = helpers.validatePath(pathParts);
    const subtype = helpers.getImportSubtype([]);
    const implicitImports = [{name: "*", alias: null}];
    
    // Create values object with node arrays
    const values = {
      imports: implicitImports.map(item => helpers.createVariableReferenceNode('import', { identifier: item.name })),
      path: pathData.values
    };
    
    // Create raw object with text segments
    const raw = {
      imports: "*",
      path: pathRaw.trim()
    };
    
    // Create meta object with metadata
    const meta = {
      isAbsolute: pathData.isAbsolute,
      hasVariables: pathData.hasVariables,
      hasTextVariables: pathData.hasTextVariables,
      hasPathVariables: pathData.hasPathVariables,
      isRelativeToCwd: pathData.isRelativeToCwd
    };
    
    return helpers.createStructuredDirective('import', subtype, values, raw, meta, location());
  }

ImportDirective_WithClause
  = "import" _ 
    "[" _ imports:ImportsList _ "]" _ "from" _ 
    "[" pathParts:BracketInterpolatableContentOrEmpty "]"
    HWS DirectiveEOL {
      // Get the raw text by reconstructing from the parsed nodes
      const importsRaw = imports.map(item => item.name).join(", ");
      const pathRaw = helpers.reconstructRawString(pathParts);
      
      // Regular path processing
      const validatedPath = helpers.validatePath(pathParts);
      const subtype = helpers.getImportSubtype(imports);
      
      // Create values object with node arrays
      const values = {
        imports: imports.map(item => helpers.createVariableReferenceNode('import', { identifier: item.name })),
        path: validatedPath.values
      };
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw.trim(),
        path: pathRaw.trim()
      };
      
      // Create meta object with metadata
      const meta = {
        isAbsolute: validatedPath.isAbsolute,
        hasVariables: validatedPath.hasVariables,
        hasTextVariables: validatedPath.hasTextVariables,
        hasPathVariables: validatedPath.hasPathVariables,
        isRelativeToCwd: validatedPath.isRelativeToCwd
      };
      
      return helpers.createStructuredDirective('import', subtype, values, raw, meta, location());
    }
  / "import" _ "[" importsContent:(_ imports:ImportsList _ &{return true;} importsRaw:$([]) {
      return {imports, importsRaw: input.substring(peg$savedPos, peg$currPos).trim()};
    }) "]" _ "from" __ variableContent:(variable:Variable &{return true;} variableRaw:$([]) {
      return {variable, variableRaw: input.substring(peg$savedPos, peg$currPos)};
    }) HWS DirectiveEOL {
    const { imports, importsRaw } = importsContent;
    const { variable, variableRaw } = variableContent;
    const validatedPath = helpers.validatePath([variable]);
    const subtype = helpers.getImportSubtype(imports);
    
    // Create values object with node arrays
    const values = {
      imports: imports.map(item => helpers.createVariableReferenceNode('import', { identifier: item.name })),
      path: validatedPath.values
    };
    
    // Create raw object with text segments
    const raw = {
      imports: importsRaw.trim(),
      path: variableRaw.trim()
    };
    
    // Create meta object with metadata
    const meta = {
      isAbsolute: validatedPath.isAbsolute,
      hasVariables: validatedPath.hasVariables,
      hasTextVariables: validatedPath.hasTextVariables,
      hasPathVariables: validatedPath.hasPathVariables,
      isRelativeToCwd: validatedPath.isRelativeToCwd
    };
    
    return helpers.createStructuredDirective('import', subtype, values, raw, meta, location());
  }
  / // Traditional import (backward compatibility)
    "import" _ "[" pathContent:(pathParts:BracketInterpolatableContentOrEmpty &{return true;} pathRaw:$([]) {
      return {pathParts, pathRaw: input.substring(peg$savedPos, peg$currPos)};
    }) "]" DirectiveEOL {
      const { pathParts, pathRaw } = pathContent;
      const validatedPath = helpers.validatePath(pathParts);
      const implicitImports = [{name: "*", alias: null}];
      const subtype = helpers.getImportSubtype(implicitImports);
      
      // Create values object with node arrays
      const values = {
        imports: implicitImports.map(item => helpers.createVariableReferenceNode('import', { identifier: item.name })),
        path: validatedPath.values
      };
      
      // Create raw object with text segments
      const raw = {
        imports: "*",
        path: pathRaw.trim()
      };
      
      // Create meta object with metadata
      const meta = {
        isAbsolute: validatedPath.isAbsolute,
        hasVariables: validatedPath.hasVariables,
        hasTextVariables: validatedPath.hasTextVariables,
        hasPathVariables: validatedPath.hasPathVariables,
        isRelativeToCwd: validatedPath.isRelativeToCwd
      };
      
      return helpers.createStructuredDirective('import', subtype, values, raw, meta, location());
    }
  / // Traditional import with variable (backward compatibility)
    "import" __ variableContent:(variable:Variable &{return true;} variableRaw:$([]) {
      return {variable, variableRaw: input.substring(peg$savedPos, peg$currPos)};
    }) DirectiveEOL {
      const { variable, variableRaw } = variableContent;
      const validatedPath = helpers.validatePath([variable]);
      const implicitImports = [{name: "*", alias: null}];
      const subtype = helpers.getImportSubtype(implicitImports);
      
      // Create values object with node arrays
      const values = {
        imports: implicitImports.map(item => helpers.createVariableReferenceNode('import', { identifier: item.name })),
        path: validatedPath.values
      };
      
      // Create raw object with text segments
      const raw = {
        imports: "*",
        path: variableRaw.trim()
      };
      
      // Create meta object with metadata
      const meta = {
        isAbsolute: validatedPath.isAbsolute,
        hasVariables: validatedPath.hasVariables,
        hasTextVariables: validatedPath.hasTextVariables,
        hasPathVariables: validatedPath.hasPathVariables,
        isRelativeToCwd: validatedPath.isRelativeToCwd
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
