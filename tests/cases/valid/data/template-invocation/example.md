/exe @greeting(name) = [[Hello, {{name}}!]]
/exe @farewell(name, when) = [[Goodbye {{name}}, see you {{when}}!]]

/var @messages = {
welcome: @greeting("Alice"),
goodbye: @farewell("Bob", "tomorrow"),
nested: {
morning: @greeting("Charlie"),
evening: @farewell("David", "next week")
  }
}

/show [[{{messages.welcome}}
{{messages.goodbye}}
{{messages.nested.morning}}
{{messages.nested.evening}}]]