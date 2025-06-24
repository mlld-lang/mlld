/var @condition1 = "true"
/var @condition2 = ""
/var @condition3 = "yes"

# Bare @when with individual actions - executes all matching
/when @condition1: [
  @condition1 => show "Condition 1 matched"
  @condition2 => show "Condition 2 matched"
  @condition3 => show "Condition 3 matched"
]