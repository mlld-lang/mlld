/exe @greetCmd(name, title) = cmd { echo @title?`HONORIFIC:` @name }
/exe @greetTemplate(name, title) = ::@title?`HONORIFIC: `@name::
/var @nil = null

/run @greetCmd("Ada", @nil)
/run @greetTemplate("Ada", @nil)
/run @greetCmd("Ada", "null")
/run @greetTemplate("Ada", "null")
