/guard @checkInput before secret = when [
  * => allow
]

/guard @checkOutput after secret = when [
  * => allow
]

/guard @checkBoth always op:exe = when [
  * => allow @tagValue(@mx.guard.timing, @output, @input)
]