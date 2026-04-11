for-loops cannot be used directly as object field values

Found:
  ${FIELD_LINE}

This is not a problem with `when [...]` itself. The failing construct is the inline object field value:

  ${FIELD_NAME}: ${EXPRESSION}

Extract the loop first:

  let @${TEMP_VAR} = ${EXPRESSION}

Then reference that value from the object:

  ${FIELD_NAME}: @${TEMP_VAR}

This pattern works the same inside `when` branches, `=> { ... }` returns, and plain object literals.
