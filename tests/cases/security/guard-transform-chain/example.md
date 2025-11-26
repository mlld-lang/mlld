# Guard transform chaining before and after

/guard @trimUntrusted before untrusted = when [
  @input.trim() != @input => allow @input.trim()
  * => allow
]

/guard @maskUntrusted after untrusted = when [
  !@output.startsWith("SAFE:") => allow `SAFE:@output.toUpperCase()`
  * => allow
]

/var untrusted @raw = "  payload  "
/show `value: @raw`
