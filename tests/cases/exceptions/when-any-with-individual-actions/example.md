/var @condition1 = "true"
/var @condition2 = "false"

# Testing deprecated 'any' modifier error
/when @condition1 any: [
  @condition1
  @condition2
] => show "Some action"
