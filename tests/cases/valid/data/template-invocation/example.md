@text greeting(name) = @add [[Hello, {{name}}!]]
@text farewell(name, when) = @add [[Goodbye {{name}}, see you {{when}}!]]

@data messages = {
  welcome: @add @greeting("Alice"),
  goodbye: @add @farewell("Bob", "tomorrow"),
  nested: {
    morning: @add @greeting("Charlie"),
    evening: @add @farewell("David", "next week")
  }
}

@add [[{{messages.welcome}}
{{messages.goodbye}}
{{messages.nested.morning}}
{{messages.nested.evening}}]]