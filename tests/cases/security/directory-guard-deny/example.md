/guard before op:exe = when [
  @input.any.mx.taint.includes('dir:/blocked-dir') => deny "blocked directory"
  * => allow
]

/exe @runBlocked(value) = cmd {echo @value}

/exe @safeEcho(value) = when [
  denied => show "Guard blocked operation: @mx.guard.reason"
  * => @runBlocked(@value)
]

/var @blocked = <blocked-dir/dir-blocked-secret.txt>

/show @safeEcho(@blocked)
