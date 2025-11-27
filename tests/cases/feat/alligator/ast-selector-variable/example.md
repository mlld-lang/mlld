# AST Selector Variable Interpolation

Test that type filters and name lists work with variable interpolation.

/exe @names(json) = js {
  const data = JSON.parse(json);
  return data.filter(Boolean).map(item => item.name).sort().join(', ');
}

## Type filter with variable: *@type

/var @type = "fn"
/var @funcs = <ast-selector-variable-service.ts { *@type }>|@json|@names

/show @funcs

## Name list with variable: @type??

/var @type2 = "class"
/var @classNames = <ast-selector-variable-service.ts { @type2?? }>

/show @classNames.join(", ")
