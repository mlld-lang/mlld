Actions like ${ACTION} cannot be used in exe when expressions

exe functions must return values, not perform actions:
  ✗ exe @${FUNCNAME}() = when: [ condition => ${ACTION} "text" ]
  ✅ exe @${FUNCNAME}() = when: [ condition => "text" ]

To perform actions, use when at the directive level:
  when: [ condition => ${ACTION} "text" ]