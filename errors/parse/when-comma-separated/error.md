Invalid when block syntax: conditions cannot be comma-separated

Found: ${LINE}

Each condition must be on its own line or separated by semicolons:
  ${FIRST_CONDITION} => ${FIRST_ACTION}, ${SECOND_CONDITION} => ${SECOND_ACTION}  (wrong)
  ${FIRST_CONDITION} => ${FIRST_ACTION}; ${SECOND_CONDITION} => ${SECOND_ACTION}  (right)
  ${FIRST_CONDITION} => ${FIRST_ACTION}
  ${SECOND_CONDITION} => ${SECOND_ACTION}                                          (right)

if vs when:
  if @cond [block]                 Run block if true
  when @cond => action             Select first match
  when [cond => val; * => default] First-match list
  when @val ["a" => x; * => y]    Match value against patterns
