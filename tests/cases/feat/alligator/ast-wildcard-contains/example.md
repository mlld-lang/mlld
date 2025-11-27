# AST Wildcard Contains Pattern

Test that `*Request*` matches all functions containing "Request".

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract *Request* functions

/var @requests = <ast-wildcard-contains-service.ts { *Request* }>|@json|@names

/show @requests
