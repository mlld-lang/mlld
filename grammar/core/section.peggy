// Core section extraction patterns
// Used by both @add and @text directives for extracting sections from files

SectionExtractionCore "Section extraction"
  = section:LiteralContent _ "from" _ path:PathExpression rename:AsNewTitle? {
      const result = {
        section: section,
        path: path.values.path || path.values.url,
        pathSubtype: path.subtype
      };
      
      if (rename) {
        result.rename = rename;
      }
      
      result.meta = {
        hasRename: !!rename,
        pathSubtype: path.subtype
      };
      
      return result;
    }