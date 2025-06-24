/var @condition1 = "true"
/var @condition2 = "yes"
/var @condition3 = "1"

# Bare @when with block action - like all:
/when @condition1: [
  @condition1
  @condition2
  @condition3
] => @show "All conditions matched"