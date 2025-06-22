# Test Explicit Module Export

This tests a module with explicit @data module export.

/import { * as utils } from "./test-module.mld"
/add [[Greeting: {{utils.greet("World")}}]]
/add [[Hidden function accessible: {{utils.internalHelper ? "Yes" : "No"}}]]