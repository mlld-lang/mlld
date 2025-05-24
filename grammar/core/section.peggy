// Core section extraction patterns
// Used by both @add and @text directives for extracting sections from files

SectionExtractionCore "Section extraction"
  = section:QuotedSectionTitle _ "from" _ path:PathCore rename:AsNewTitle? {
      const result = {
        section: section,
        path: path.values.path
      };
      
      if (rename) {
        result.rename = rename;
      }
      
      result.meta = {
        hasRename: !!rename
      };
      
      return result;
    }