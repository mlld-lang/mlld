---
description: Error when module declares an export that is never defined
---

# Missing Export Test

This should fail because the module's manifest references an undefined name.

/import { missingVar } from "missing-export-module.mld"

/show @missingVar
