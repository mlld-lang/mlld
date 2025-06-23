# Test Explicit Module Export

This tests a module with explicit @data module export.

/import { * as utils } from "./test-module.mld"
/show [[Greeting: {{utils.greet("World")}}]]
/show [[Hidden function accessible: {{utils.internalHelper ? "Yes" : "No"}}]]