/exe @fetch() = `raw`
/exe @verify(value) = `verified:@value`

/guard before publishes = when [
  @mx.tools.history.length() < 2 || @mx.tools.history[1].name != "verify" => deny "Need verify lineage"
  * => allow
]

/exe publishes @publish(value) = when [
  denied => `BLOCKED: @mx.guard.reason`
  * => `published: @value`
]

/var @raw = @fetch()
/var @blocked = @publish(@raw)
/show @blocked

/var @checked = @verify(@raw)
/var @allowed = @publish(@checked)
/show @allowed
