# Mixed Module Syntax Test

This tests mixing module hashes with the legacy namespace import forms.

/import module { api } from @service/client@a1b2c3
/show API status: @api.status

/import live { * } from @core/runtime@xyz789
/show Runtime version: @version

/import module { constants } from @shared/config@fedcba9876543210
/show App name: @constants.appName
