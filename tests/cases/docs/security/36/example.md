/guard before secret = when [
  @mx.op.type == "pipeline-stage" && @mx.guard.try == 1 => retry "Try again"
  * => allow
]

/exe @mask(v) = js { return v.replace(/.(?=.{4})/g, '*'); }

/var secret @key = "sk-12345"
/var @safe = @key with { pipeline: [@mask] }
/show @safe                                # Retries once, then succeeds