@exec getValue = js [(return "test-value")]
@exec getMessage = js [(return "Hello from exec")]
@exec greet(name) = [[Hello, {{name}}!]]

@data demo = {
  valueCmd: @getValue,
  messageCmd: @getMessage,
  greetCmd: @greet,
  value: @getValue(),
  message: @getMessage(),
  greeting: @greet("World")
}

@text info1 = [[Demo object contains:]]
@text info2 = [[- valueCmd type: {{demo.valueCmd.type}}]]
@text info3 = [[- value result: {{demo.value}}]]
@text info4 = [[- message result: {{demo.message}}]]
@text info5 = [[- greeting result: {{demo.greeting}}]]

@add @info1
@add @info2
@add @info3
@add @info4
@add @info5

@text execMsg = [[

Executing stored command:]]
@data result = @run @demo.valueCmd()
@text resultMsg = [[Result: {{result}}]]

@add @execMsg
@add @resultMsg