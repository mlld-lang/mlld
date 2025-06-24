/var @condition1 = "true"
/var @condition2 = "false"

# Invalid: any: modifier cannot have individual actions
/when @condition1 any: [
  @condition1 => @show "Action 1"
  @condition2 => @show "Action 2"
]