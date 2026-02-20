'let' is for block-scoped variables -- temporary, mutable
Use 'var' at top level for module vars -- immutable for security/taint tracking

At the top level of a .mld file, use 'var' to declare variables:
  ✗ let @${VARNAME} = ${VALUE}
  ✅ var @${VARNAME} = ${VALUE}

'let' creates temporary variables inside blocks (like exe functions):
  exe @myFunc() = [
    let @temp = "local only"
    ...
  ]
