/var @condition1 = "true"
/var @condition2 = "false"

# Invalid: any: modifier cannot have individual actions
/when @condition1 any: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
]