# AST Type Filter - Classes

Test that `{ *class }` returns all classes.

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Extract all classes with *class

/var @classes = <ast-type-filter-class-service.ts { *class }>|@json|@names

/show @classes
