# Test Auto-Generated Module Export

This tests a module without explicit module export (auto-generated).

/import "./auto-export-test-module.mld" as @utils
/show `Var 1: @utils.func1`
/show `Var 2: @utils.func2`
/show `Internal var: @utils._internal`
