Incorrect syntax: Using shell block {...} when you mean a when expression

Found: exe @${FUNC}(${PARAMS}) = { ... with when inside

Mental model: shell blocks {...} run commands; when expressions return values.

The curly braces {...} after exe create a shell command block, which has security restrictions including no shell redirections (>, <, >>, etc).

You likely mean to use a when expression instead:

Wrong: exe @${FUNC}(${PARAMS}) = {
    when @condition => action
  }

Right: exe @${FUNC}(${PARAMS}) = when [
    @condition => action
    * => default
  ]

Key differences:
- Shell blocks {...} execute shell commands with restrictions
- When expressions when [...] return values
- Shell blocks use when directives inside
- When expressions use bare conditions without when

Common exe patterns:
Template: exe @greet(name) = `Hello @name`
When expression: exe @pick(val) = when [@val > 0 => "pos", * => "neg"]
Shell command: exe @list() = {ls -la}
JavaScript: exe @calc(x) = js { return x * 2 }

Your case should probably be:
${SUGGESTION}
