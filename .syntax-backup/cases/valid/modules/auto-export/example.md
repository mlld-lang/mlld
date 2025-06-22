# Test Auto-Generated Module Export

This tests a module without explicit module export (auto-generated).

@import { * as utils } from "./test-module.mld"
@add [[Function 1: {{utils.func1()}}]]
@add [[Function 2: {{utils.func2()}}]]
@add [[Internal helper: {{utils._internal()}}]]