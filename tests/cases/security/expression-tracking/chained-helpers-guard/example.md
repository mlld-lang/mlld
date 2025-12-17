/guard @trimChainBlock for secret = when [
  @mx.op.name == "emitTrimmed" => deny "No secrets via chained helpers"
  * => allow
]

/exe @emitTrimmed(value) = when [
  denied => show `guard result: @mx.guard.reason`
  * => show `allowed: @value`
]

/var secret @key = "  sk-trim-98765  "
/show @emitTrimmed(@key.trim().slice(0, 5))
