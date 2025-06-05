@text greetingTemplate(name, title) = @add [[
Hello {{title}} {{name}}!
Welcome back, {{name}}!
]]

@text userName = "Alice"
@text userTitle = "Dr."
@add @greetingTemplate(@userName, @userTitle)