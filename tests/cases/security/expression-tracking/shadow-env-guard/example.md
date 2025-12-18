/guard @shadowSecretBlock for secret = when [
  @mx.op.name == "processShadow" => deny "Shadow env secret blocked"
  * => allow
]

/exe @trimStage(value) = js {
  return value.trim().slice(0, 6);
}

/exe network @processShadow(value) = when [
  denied => `blocked: @mx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-shadow-900  "
/show @processShadow(@trimStage(@token))
