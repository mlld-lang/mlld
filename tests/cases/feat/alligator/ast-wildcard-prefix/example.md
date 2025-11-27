# AST Wildcard Prefix Pattern

Test that `handle*` matches all functions starting with "handle".

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract handle* functions

/var @handlers = <ast-wildcard-prefix-service.ts { handle* }>|@json|@names

/show @handlers
