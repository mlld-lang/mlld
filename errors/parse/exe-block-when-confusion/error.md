Incorrect syntax: Using shell block {...} when you meant a when expression

Found: /exe @${FUNC}(${PARAMS}) = { ... with /when inside

The curly braces {...} after /exe create a shell command block, which has security restrictions including no shell redirections (>, <, >>, etc). 

You likely meant to use a when expression instead:

✗ Wrong: /exe @${FUNC}(${PARAMS}) = {
    /when @condition => action
  }

✓ Right: /exe @${FUNC}(${PARAMS}) = when [
    @condition => action
    * => default
  ]

Key differences:
- Shell blocks {...} execute shell commands with restrictions
- When expressions when [...] evaluate conditions and return values
- Shell blocks use /when directives inside
- When expressions use bare conditions without /when

Common /exe patterns:
✓ Template: /exe @greet(name) = `Hello @name`
✓ When expression: /exe @pick(val) = when [@val > 0 => "pos", * => "neg"]
✓ Shell command: /exe @list() = {ls -la}
✓ JavaScript: /exe @calc(x) = js { return x * 2 }

Your case should probably be:
${SUGGESTION}