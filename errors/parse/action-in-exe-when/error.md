Actions like ${ACTION} do not work inside exe when expressions

Mental model: exe + when returns a value; /when runs actions.

Valid forms:
  exe @${FUNCNAME}() = when [ condition => "text"; * => "default" ]
  when [ condition => ${ACTION} "text" ]

Fix: return a value from the exe when, or move the action to /when.
