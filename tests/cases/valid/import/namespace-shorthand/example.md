---
description: Import with shorthand namespace syntax
---

# Namespace Import Test

Testing the new shorthand namespace import syntax.

## Import without alias (auto-derived namespace)

/import [./namespace-test-config.mld]

/show `Config author: @namespace_test_config.author`
/show `Config version: @namespace_test_config.version`

## Import with explicit alias

/import [./namespace-test-utils.mld] as lib

/show `Library greeting: @lib.greeting`
/show `Library version: @lib.version`

## Import JSON with auto-derived namespace

/import [./namespace-test-data.json]

/show `Data value: @namespace_test_data.value`