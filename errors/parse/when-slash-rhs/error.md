No slash needed after => in when directives

Found: when ${CONDITION} => ${ACTION}

In when actions (after =>), directives don't need the slash prefix:
  when ${CONDITION} => ${ACTION}        (wrong)
  when ${CONDITION} => ${FIXED_ACTION}  (right)

if vs when:
  if @cond [block]                 Run block if true
  when @cond => action             Select first match
  when [cond => val; * => default] First-match list
  when @val ["a" => x; * => y]    Match value against patterns
