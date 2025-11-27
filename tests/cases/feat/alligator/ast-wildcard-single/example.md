# AST Wildcard Single Character Pattern

Test that `get?` matches functions with exactly one character after "get".

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract get? functions (single char wildcard)

/var @getters = <ast-wildcard-single-service.ts { get? }>|@json|@names

/show @getters
