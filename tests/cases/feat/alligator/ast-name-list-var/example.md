# AST Name List - Variables

Test that `{ var?? }` returns only variable and constant names.

## List variable names with var??

/var @varNames = <ast-name-list-var-service.ts { var?? }>

/show @varNames.join(", ")
