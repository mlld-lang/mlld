---
description: /var assignment with nullish coalescing operator
---

/var @present = ""
/var @zero = 0

/var @missingDefault = @missing ?? "DEFAULT"
/var @nullDefault = null ?? "DEFAULT"
/var @presentDefault = @present ?? "DEFAULT"
/var @zeroDefault = @zero ?? 99
/var @chain = @missing ?? @alsoMissing ?? "LAST"

/show @missingDefault
/show @nullDefault
/show @presentDefault
/show @zeroDefault
/show @chain
