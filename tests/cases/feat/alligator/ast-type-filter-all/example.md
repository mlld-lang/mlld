# AST Type Filter - All Definitions

Test that `{ * }` returns all top-level definitions.

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract all definitions with *

/var @all = <ast-type-filter-all-service.ts { * }>|@json|@names

/show @all
