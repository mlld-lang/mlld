# Mixed Module Syntax Test

This tests mixing module hash with security options.

@import (30m) trust verify { api } from @service/client@a1b2c3
@add API status: @api.status

@import (live) trust always { * } from @core/runtime@xyz789
@add Runtime version: @version

@import (static) { constants } from @shared/config@fedcba9876543210
@add App name: @constants.appName