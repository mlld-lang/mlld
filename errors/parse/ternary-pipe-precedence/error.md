Pipe inside ternary branches is not supported yet.

Wrap the piped expression in an exe block:

  var @${VARNAME} = ${CONDITION} ? [ => ${TRUE_BRANCH} ] : ${FALSE_BRANCH}

Or split into separate steps:

  var @piped = ${TRUE_BRANCH}
  var @${VARNAME} = ${CONDITION} ? @piped : ${FALSE_BRANCH}
