@text feature1 = "enabled"
@text feature2 = "true"
@text feature3 = "on"

# all: with individual actions - executes each action for true conditions
@when @feature1 all: [
  @feature1 => @add "Feature 1 is enabled"
  @feature2 => @add "Feature 2 is enabled"
  @feature3 => @add "Feature 3 is enabled"
]