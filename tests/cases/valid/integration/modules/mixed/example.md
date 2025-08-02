# Mixed Module Syntax Test

This tests mixing module hash with security options.

/import (30m) trust verify { api } from @service/client@a1b2c3
/show API status: @api.status

/import (live) trust always { * } from @core/runtime@xyz789
/show Runtime version: @version

/import (static) { constants } from @shared/config@fedcba9876543210
/show App name: @constants.appName