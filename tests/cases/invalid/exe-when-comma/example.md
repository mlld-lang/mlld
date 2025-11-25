/exe @handler(prompt) = when [
  @ctx.try == 1 => "a",
  * => "b"
]
