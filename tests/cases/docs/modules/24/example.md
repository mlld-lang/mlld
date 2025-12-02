/guard before secret = when [
  @input.ctx.taint.includes('src:dynamic') =>
    deny "Cannot use dynamic data as secrets"
  * => allow
]