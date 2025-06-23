# Module Hash Syntax Test

This tests the module hash syntax for content verification.

/import { config } from @user/settings@abc123
/show @config.theme

/import { * } from @org/utils@def456789
/show @version

/import { helpers } from @namespace/lib@1a2b3c4d5e
/show @helpers.formatDate

Long hash example:
/import { tools } from @company/toolkit@0123456789abcdef
/show @tools.name