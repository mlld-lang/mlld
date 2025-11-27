# AST Wildcard Suffix Pattern

Test that `*Validator` matches all functions ending with "Validator".

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract *Validator functions

/var @validators = <ast-wildcard-suffix-service.ts { *Validator }>|@json|@names

/show @validators
