/guard @secretAllow for secret = when [
  @ctx.op.name == "stackedSend" => allow
  * => allow
]

/guard @opExecBlock for op:exe = when [
  @ctx.op.name == "stackedSend" && @input.any.ctx.labels.includes("secret") => deny "Op guard blocked secret exe"
  * => allow
]

/exe network @stackedSend(value) = when [
  denied => show `stacked guard: @ctx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-stack-999  "
/show @stackedSend(@token.trim())
