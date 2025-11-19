/guard @loopSecretBlock for secret = when [
  @ctx.op.name == "emitIterItem" => deny "Secret iteration blocked"
  * => allow
]

/exe @emitIterItem(value) = when [
  denied => show `blocked iteration: @ctx.guard.reason`
  * => show `value: @value`
]

/var secret @items = ["alpha", "beta", "gamma"]
/for @item in @items => @emitIterItem(@item.trim().toUpperCase())
