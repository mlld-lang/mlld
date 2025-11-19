/guard @loopSecretBlock for secret = when [
  @ctx.op.type == "show" => deny "Secret iteration blocked"
  * => allow
]

/var secret @items = ["alpha", "beta", "gamma"]
/for @item in @items => show @item.trim().toUpperCase()
