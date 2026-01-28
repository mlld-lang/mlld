Use 'let' instead of 'var' inside exe blocks

Inside exe functions, use 'let' to declare local variables:
  ✗ exe @${FUNCNAME}() = [ var @${VARNAME} = ... ]
  ✅ exe @${FUNCNAME}() = [ let @${VARNAME} = ... ]

'var' declares module-level variables -- immutable for security/taint tracking
'let' creates block-scoped locals -- temporary, mutable
