# AST Mixed Selectors Error

Test that mixing content selectors with name-list selectors throws an error.

## This should fail - mixing content and name-list selectors

/var @mixed = <ast-mixed-selectors-service.ts { createUser, fn?? }>

/show @mixed
