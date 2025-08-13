---
description: For loop iterating over object values
---

/var @config = {"host": "localhost", "port": 3000}
/for @value in @config => show `Config: @value`