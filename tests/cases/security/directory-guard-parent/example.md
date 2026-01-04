/guard before op:exe = when [
  @input.any.mx.taint.includes('dir:/dir-parent-blocked') => deny "parent dir blocked"
  * => allow
]

/exe @runBlocked(value) = cmd {echo @value}

/exe @safeEcho(value) = when [
  denied => show "Guard blocked operation: @mx.guard.reason"
  * => @runBlocked(@value)
]

/var @blocked = <dir-parent-blocked/nested/dir-parent-secret.txt>

/show @safeEcho(@blocked)
