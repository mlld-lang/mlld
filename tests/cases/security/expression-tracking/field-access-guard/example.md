/guard @configSecretBlock for secret = when [
  @mx.op.name == "emitConfigSecret" => deny "Nested field secrets blocked"
  * => allow
]

/exe @emitConfigSecret(value) = when [
  denied => show `guard result: @mx.guard.reason`
  * => show `nested: @value`
]

/var secret @config = {
  api: {
    key: "sk-nested-555"
  }
}

/show @emitConfigSecret(@config.api.key)
