/guard @noNetwork before op:run = when [
  @mx.op.subtype == "sh" => deny "Shell access blocked"
  * => allow
]

/guard @noExecNetwork before op:exe = when [
  @input.any.mx.labels.includes("network") => deny "Network calls blocked"
  * => allow
]