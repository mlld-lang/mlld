/var @condition1 = "true"
/var @condition2 = "yes"
/var @condition3 = "1"

# Bare @when with block action - evaluates all conditions for truthiness
/when all: [
  @condition1
  @condition2
  @condition3
] => show "All conditions matched"