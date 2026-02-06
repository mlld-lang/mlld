Actions like ${ACTION} do not work inside exe when expressions

Mental model: exe + when returns a value; when runs actions.

Valid forms:
  exe @${FUNCNAME}() = when [ condition => "text"; * => "default" ]
  when [ condition => ${ACTION} "text" ]

Fix: return a value from the exe when, or move the action to when.

if vs when:
  if @cond [block]                 Run block if true
  when @cond => action             Select first match
  when [cond => val; * => default] First-match list
  when @val ["a" => x; * => y]    Match value against patterns
