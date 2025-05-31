# Module Hash Syntax Test

This tests the module hash syntax for content verification.

@import { config } from @user/settings@abc123
@add @config.theme

@import { * } from @org/utils@def456789
@add @version

@import { helpers } from @namespace/lib@1a2b3c4d5e
@add @helpers.formatDate

Long hash example:
@import { tools } from @company/toolkit@0123456789abcdef
@add @tools.name