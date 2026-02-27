# Guard Composition - Import Flatten Order

/var secret @value = "seed"

/import { @gImported } from "./guard-import-order.mld"

/exe @report(val) = `t0: @p.guards[0].trace[0].guardName, t1: @p.guards[0].trace[1].guardName
value: @val`

/guard @gLocal for secret = when [
  * => allow `@input\-local`
]

/show @value | @report
