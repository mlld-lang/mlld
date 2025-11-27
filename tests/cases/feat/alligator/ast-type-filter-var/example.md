# AST Type Filter - Variables

Test that `{ *var }` returns all variables and constants.

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract all variables with *var

/var @vars = <ast-type-filter-var-service.ts { *var }>|@json|@names

/show @vars
