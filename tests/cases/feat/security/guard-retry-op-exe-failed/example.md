# Guard Retry Failed (op:exe)

/guard @exeRetry for op:exe = when [
  * => retry "Need pipeline context"
]

/exe @emit(value) = js { return value; }

/show @emit("Hello")
