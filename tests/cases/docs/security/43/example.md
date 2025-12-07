/guard @tag always op:exe = when [
  * => allow @tagValue(@ctx.guard.timing, @output, @input)
]