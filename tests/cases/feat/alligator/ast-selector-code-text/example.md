# AST Selector - Code Text

Verify brace-syntax selector returns code content as text, not metadata JSON.

## Single class from Python shows code

/var @cls = <ast-selector-code-text-source.py { Greeter }>
/show @cls

## Multiple selections show joined code

/var @fns = <ast-selector-code-text-source.ts { createUser, deleteUser }>
/show @fns

## Metadata fields still accessible

/show @cls[0].name
/show @cls[0].type
