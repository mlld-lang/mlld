/exe @getJSON(prompt) = when [
  @ctx.try == 1 => @claude(@prompt)
  @ctx.try > 1 => @claude("@prompt Return ONLY valid JSON. Previous attempt: @ctx.hint")
]