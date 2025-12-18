/exe @handler(prompt) = when [
  @mx.try == 1 => "a",
  * => "b"
]
