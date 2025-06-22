/exec @greeting(name) = [[Hello, {{name}}!]]
/exec @farewell(name, when) = [[Goodbye {{name}}, see you {{when}}!]]

/data @messages = {
  welcome: @add @greeting("Alice"),
  goodbye: @add @farewell("Bob", "tomorrow"),
  nested: {
    morning: @add @greeting("Charlie"),
    evening: @add @farewell("David", "next week")
  }
}

/add [[{{messages.welcome}}
{{messages.goodbye}}
{{messages.nested.morning}}
{{messages.nested.evening}}]]