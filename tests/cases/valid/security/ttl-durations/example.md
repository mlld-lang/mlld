# TTL Duration Tests

This tests various TTL duration formats.

/import (30s) { config } from "./config.mld"
/import (5m) { utils } from "./utils.mld"
/import (2h) { helpers } from "./helpers.mld"
/import (7d) { data } from "./data.mld"
/import (1w) { templates } from "./templates.mld"

/add (10m) "./docs.md"
/add (24h) @config.greeting

/path (1h) cachePath = "./cache"
/add (30s) @cachePath

/text @greeting = [[Hello from {{config.name}}!]]
/add (5m) @greeting