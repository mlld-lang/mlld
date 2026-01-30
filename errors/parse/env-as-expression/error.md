/env requires a block syntax with [ ]

Found: ${ORIGINAL}

The env directive creates a scoped execution environment and must wrap a block:

  env ${CONFIG} [
    exe @result = {command}
  ]

The /env directive cannot be used as an expression value.
