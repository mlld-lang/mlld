# TTL Special Values Tests

This tests special TTL values: live and static.

/import (live) { api } from "./api.mld"
/import (static) { constants } from "./constants.mld"

/show (live) @api.status
/show (static) @constants.version

/path (live) dynamicPath = "./dynamic"
/show (live) @dynamicPath

/var (static) fixedMessage = "This is static"
/show (static) @fixedMessage