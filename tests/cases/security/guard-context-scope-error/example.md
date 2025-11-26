# Guard context not exposed after guard completes

/guard before secret = when [
  * => allow
]

/var secret @token = "sek"
/show `value: @token`
/show `ctx guard try: @ctx.guard.try`
