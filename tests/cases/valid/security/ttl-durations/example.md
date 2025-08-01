# TTL Duration Tests

This tests various TTL duration formats.

/import (30s) { config } from "./security-test-config.mld"
/import (5m) { utils } from "./security-test-utils.mld"
/import (2h) { helpers } from "./security-test-helpers.mld"
/import (7d) { data } from "./security-test-data.mld"
/import (1w) { templates } from "./security-test-templates.mld"

/show (10m) "./docs.md"
/show (24h) @config.greeting

/path (1h) cachePath = "./cache"
/show (30s) @cachePath

/var @greeting = :::Hello from {{config.name}}!:::
/show (5m) @greeting