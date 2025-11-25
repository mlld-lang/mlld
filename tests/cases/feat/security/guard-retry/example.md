# Guard Retry

/guard for secret = when [
  @ctx.op.type == "pipeline-stage" && @ctx.op.subtype == "maskSecret" && @ctx.guard.try == 1 => retry "Run mask stage again"
  * => allow
]

/exe @generateSecret() = js { return 'sk-live-1234'; }
/exe @maskSecret(value) = js { return value.replace(/.(?=.{4})/g, '*'); }

/var secret @rawSecret = @generateSecret()

/var @safeSecret = @rawSecret with {
  pipeline: [
    @maskSecret
  ]
}

/show `Masked secret: @safeSecret`
