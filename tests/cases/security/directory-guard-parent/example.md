/guard before op:exe = when [
  @input.any.ctx.taint.includes('dir:/dir-parent-blocked') => deny "parent dir blocked"
  * => allow
]

/exe @runBlocked(value) = cmd {echo @value}

/exe @safeEcho(value) = when [
  denied => show "Guard blocked operation: @ctx.guard.reason"
  * => @runBlocked(@value)
]

/var @blocked = <dir-parent-blocked/nested/dir-parent-secret.txt>

/show @safeEcho(@blocked)
