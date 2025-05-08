// TEXT DIRECTIVE
// Implementation of the @text directive for variable definition through templates

// Primary @text directive
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore { return {}; }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@run" _ runCommand:RunDirectiveRef { return {}; }
  / DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ "@add" _ addPath:AddDirectiveRef { return {}; }