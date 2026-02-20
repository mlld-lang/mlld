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

Common exe patterns:
  Template:         exe @greet(name) = `Hello @name`
  When expression:  exe @pick(val) = when [@val > 0 => "pos"; * => "neg"]
  Exe block:        exe @fn(x) = [let @y = @x; => @y]
  Shell command:    exe @list() = {ls -la}
  JavaScript:       exe @calc(x) = js { return x * 2 }

if vs when:
  if @cond [block]                 Run block if true
  when @cond => action             Select first match
  when [cond => val; * => default] First-match list
  when @val ["a" => x; * => y]    Match value against patterns

Your case should probably be:
${SUGGESTION}
