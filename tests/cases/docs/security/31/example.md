/guard @noNetwork before op:run = when [
  @ctx.op.subtype == "sh" => deny "Shell access blocked"
  * => allow
]

/guard @noExecNetwork before op:exe = when [
  @input.any.ctx.labels.includes("network") => deny "Network calls blocked"
  * => allow
]