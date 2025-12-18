/guard before secret = when [
  @input.mx.taint.includes('src:dynamic') =>
    deny "Cannot use dynamic data as secrets"
  * => allow
]