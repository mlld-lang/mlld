# TTL Duration Tests

This tests various TTL duration formats.

/import (30s) { config } from "./config.mld"
/import (5m) { utils } from "./utils.mld"
/import (2h) { helpers } from "./helpers.mld"
/import (7d) { data } from "./data.mld"
/import (1w) { templates } from "./templates.mld"

/show (10m) "./docs.md"
/show (24h) @config.greeting

/path (1h) cachePath = "./cache"
/show (30s) @cachePath

/var @greeting = :::Hello from {{config.name}}!:::
/show (5m) @greeting