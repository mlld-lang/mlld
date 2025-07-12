# Dev Mode Local Module Mapping Test

This test verifies that in dev mode, imports like `@testuser/utils` are automatically
mapped to local files in `llm/modules/testuser/utils.mld`.

## Import from local module (should work in dev mode)
/import { @formatName, @greet } from @testuser/utils

## Use the imported functions
/var @fullName = @formatName("Jane", "Doe")
/show @greet(@fullName)