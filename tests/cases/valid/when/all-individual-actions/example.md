/var @feature1 = "enabled"
/var @feature2 = "true"
/var @feature3 = "on"

# all: with individual actions - executes each action for true conditions
/when @feature1 all: [
  @feature1 => show "Feature 1 is enabled"
  @feature2 => show "Feature 2 is enabled"
  @feature3 => show "Feature 3 is enabled"
]