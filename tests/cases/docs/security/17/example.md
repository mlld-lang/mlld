/guard @checkInput before secret = when [
  * => allow
]

/guard @checkOutput after secret = when [
  * => allow
]

/guard @checkBoth always op:exe = when [
  * => allow @tagValue(@ctx.guard.timing, @output, @input)
]