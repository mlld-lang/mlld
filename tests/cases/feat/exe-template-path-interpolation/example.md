/var @agent = "claude"
/exe @buildPrompt(msg) = template "exe-template-path-interpolation-@agent\.att"
/show @buildPrompt("hello")
