/guard @retryGuard before secret = when [
  * => retry "need retry"
]

/guard @denyGuard before secret = when [
  * => deny "hard stop"
]

# deny wins, but retry hint preserved in @mx.guard.hints