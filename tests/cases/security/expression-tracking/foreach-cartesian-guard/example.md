/guard @cartesianSecretBlock for secret = when [
  @ctx.op.name == "emitPair" => deny "No secret cartesian display"
  * => allow
]

/exe @pair(first, second) = `pair:@first-@second`

/exe @emitPair(value) = when [
  denied => show `blocked: @ctx.guard.reason`
  * => show @value
]

/var secret @names = ["Alpha", "Beta"]
/var @nums = [1, 2]

/show foreach @emitPair(@pair(@names, @nums))
