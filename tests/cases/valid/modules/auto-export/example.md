# Test Auto-Generated Module Export

This tests a module without explicit module export (auto-generated).

/import { * as utils } from "./test-module.mld"
/show ::Function 1: {{utils.func1()}}::
/show ::Function 2: {{utils.func2()}}::
/show ::Internal helper: {{utils._internal()}}::