# Combined TTL and Trust Tests

This tests combining TTL and Trust options.

/import (30m) trust verify { config } from "./config.mld"
/import (1h) trust always { utils } from "./utils.mld"
/import (live) trust never { dangerous } from "./dangerous.mld"

/show (5m) trust always @config.greeting
/show (static) trust verify @utils.version

/run (30s) trust always {echo "Quick and safe"}
/run (live) trust verify {echo "Live but needs check"}

/path (1d) trust always securePath = "./secure"
/show (24h) trust always @securePath