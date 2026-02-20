Cannot use mutation syntax @${VARNAME}${OPERATION} in JavaScript blocks

Variables are immutable in mlld. Return new values instead:
  ✗ @${VARNAME}${OPERATION}
  ✅ ${SUGGESTION}

In mlld, variables are values that flow through pipelines.
To update a variable, assign a new value at the mlld level:
  var @${VARNAME} = @increment(@${VARNAME})