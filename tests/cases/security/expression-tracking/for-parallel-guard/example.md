/guard @parallelDisplayBlock for secret = when [
  @mx.op.type == "exe" && @mx.op.name == "displayParallel" => deny "Parallel secret output blocked"
  * => allow
]

/exe @displayParallel(value) = when [
  denied => show `blocked: @mx.guard.reason`
  * => show `value: @value`
]

/var secret @items = ["  north  ", "  south  "]
/for parallel(2) @item in @items => @displayParallel(@item.trim())
