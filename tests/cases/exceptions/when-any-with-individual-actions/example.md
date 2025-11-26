/var @condition1 = "true"
/var @condition2 = "false"

# any modifier is deprecated - now gives parse error
/when any: [
  @condition1
  @condition2
] => show "test"
