---
description: External .att template files should interpolate object field access
---

# Test External Template with Object Field Access

/var @msg = { "from_agent": "bob", "body": "test message" }

/exe @format(message) = template "format.att"

/show @format(@msg)
