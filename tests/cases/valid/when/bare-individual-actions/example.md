/text @condition1 = "true"
/text @condition2 = ""
/text @condition3 = "yes"

# Bare @when with individual actions - executes all matching
/when @condition1: [
  @condition1 => @add "Condition 1 matched"
  @condition2 => @add "Condition 2 matched"
  @condition3 => @add "Condition 3 matched"
]