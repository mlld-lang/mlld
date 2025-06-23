/exe @getValue = js {return "test-value"}
/exe @getMessage = js {return "Hello from exec"}
/exe @greet(name) = [[Hello, {{name}}!]]

/var @demo = {
  valueCmd: @getValue,
  messageCmd: @getMessage,
  greetCmd: @greet,
  value: @getValue(),
  message: @getMessage(),
  greeting: @greet("World")
}

/var @info1 = [[Demo object contains:]]
/var @info2 = [[- valueCmd type: {{demo.valueCmd.type}}]]
/var @info3 = [[- value result: {{demo.value}}]]
/var @info4 = [[- message result: {{demo.message}}]]
/var @info5 = [[- greeting result: {{demo.greeting}}]]

/show @info1
/show @info2
/show @info3
/show @info4
/show @info5

/var @execMsg = [[

Executing stored command:]]
/var @result = @run @demo.valueCmd()
/var @resultMsg = [[Result: {{result}}]]

/show @execMsg
/show @resultMsg