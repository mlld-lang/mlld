Complex expression not supported as object field value

Found: ${FIELD_LINE}

Expressions like ${EXPRESSION} are too complex for inline object fields. Extract to a variable first:

  let @${FIELD_NAME} = ${EXPRESSION}

Then use the variable in the object:

  ${FIELD_NAME}: @${FIELD_NAME}
