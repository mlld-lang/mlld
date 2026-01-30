/var @flag = "true"
/if @flag [
  show "yes"
]
/if !@flag [
  show "no"
] else [
  show "maybe"
]
