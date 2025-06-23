/exe @greeting(name) = [[Hello, {{name}}!]]
/exe @farewell(name, when) = [[Goodbye {{name}}, see you {{when}}!]]

/var @messages = {
welcome: @add @greeting("Alice"),
goodbye: @add @farewell("Bob", "tomorrow"),
nested: {
morning: @add @greeting("Charlie"),
evening: @add @farewell("David", "next week")
  }
}

/show [[{{messages.welcome}}
{{messages.goodbye}}
{{messages.nested.morning}}
{{messages.nested.evening}}]]