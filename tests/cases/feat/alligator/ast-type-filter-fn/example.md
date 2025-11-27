# AST Type Filter - Functions

Test that `{ *fn }` returns all functions and methods.

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract all functions with *fn

/var @funcs = <ast-type-filter-fn-service.ts { *fn }>|@json|@names

/show @funcs
