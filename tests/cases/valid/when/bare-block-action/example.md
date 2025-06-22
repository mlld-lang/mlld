/text @condition1 = "true"
/text @condition2 = "yes"
/text @condition3 = "1"

# Bare @when with block action - like all:
/when @condition1: [
  @condition1
  @condition2
  @condition3
] => @add "All conditions matched"