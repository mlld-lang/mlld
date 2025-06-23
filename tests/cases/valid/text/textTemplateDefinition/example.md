/exe @greetingTemplate(name, title) = [[
Hello {{title}} {{name}}!
Welcome back, {{name}}!
]]

/var @userName = "Alice"
/var @userTitle = "Dr."
/show @greetingTemplate(@userName, @userTitle)