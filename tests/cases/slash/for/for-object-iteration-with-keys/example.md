---
description: For loop with object key access
---

>> Test that @value_key is available when iterating objects
/var @config = {"host": "localhost", "port": 3000}
/for @value in @config => show `@value_key: @value`