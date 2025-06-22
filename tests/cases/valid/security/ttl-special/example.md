# TTL Special Values Tests

This tests special TTL values: live and static.

/import (live) { api } from "./api.mld"
/import (static) { constants } from "./constants.mld"

/add (live) @api.status
/add (static) @constants.version

/path (live) dynamicPath = "./dynamic"
/add (live) @dynamicPath

/text (static) fixedMessage = "This is static"
/add (static) @fixedMessage