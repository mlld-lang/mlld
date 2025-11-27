# AST Name List - Functions

Test that `{ fn?? }` returns only function and method names.

## List function names with fn??

/var @funcNames = <ast-name-list-fn-service.ts { fn?? }>

/show @funcNames.join(", ")
