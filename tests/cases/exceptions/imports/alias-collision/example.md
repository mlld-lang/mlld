---
description: Error when two imports bind the same name without aliasing
---

# Import Alias Collision Test

The second import should fail because it reuses the same identifier.

/import { sharedVar } from "alias-collision-a.mld"
/import { sharedVar } from "alias-collision-b.mld"

/show {{sharedVar}}
