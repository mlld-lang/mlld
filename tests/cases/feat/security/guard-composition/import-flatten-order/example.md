# Guard Composition - Import Flatten Order

/import module { @gImported } from "./guard-import-order.mld"

/guard @gLocal for secret = when [
  * => allow `@input-local`
]

/var secret @value = "seed"

/exe @report(val) = cmd {
  /show `trace: @p.guards.filter(g => g.operation?.name == "report").map(g => g.trace[0].guardName)`
  /show `value: @val`
}

/show @value | @report
