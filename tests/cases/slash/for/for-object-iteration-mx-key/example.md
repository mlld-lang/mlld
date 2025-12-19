---
description: For loop exposes .mx.key for object iteration
---

/var @config = {"host": "localhost", "port": 3000}
/for @value in @config => show `@value.mx.key: @value`

