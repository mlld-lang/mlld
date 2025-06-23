/var @condition1 = "true"
/var @condition2 = ""
/var @condition3 = "yes"

# Bare @when with individual actions - executes all matching
/when @condition1: [
  @condition1 => @add "Condition 1 matched"
  @condition2 => @add "Condition 2 matched"
  @condition3 => @add "Condition 3 matched"
]