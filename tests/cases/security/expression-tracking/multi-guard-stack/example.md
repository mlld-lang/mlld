/guard @secretAllow for secret = when [
  @mx.op.name == "stackedSend" => allow
  * => allow
]

/guard @opExecBlock for op:exe = when [
  @mx.op.name == "stackedSend" && @input.any.mx.labels.includes("secret") => deny "Op guard blocked secret exe"
  * => allow
]

/exe network @stackedSend(value) = when [
  denied => show `stacked guard: @mx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-stack-999  "
/show @stackedSend(@token.trim())
