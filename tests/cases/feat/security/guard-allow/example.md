# Guard Allow

/guard @secretShowBlock for secret = when [
  @mx.op.type == "show" => deny "Secrets cannot be shown"
  * => allow
]

/var @publicMessage = "Hello, world!"

/show @publicMessage
