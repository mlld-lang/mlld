# TTL Special Values Tests

This tests special TTL values: live and static.

/import (live) { api } from "./security-test-api.mld"
/import (static) { constants } from "./security-test-constants.mld"

/show (live) @api.status
/show (static) @constants.version

/path (live) dynamicPath = "./dynamic"
/show (live) @dynamicPath

/var (static) fixedMessage = "This is static"
/show (static) @fixedMessage