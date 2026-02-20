---
description: Test .replaceAll() with object/map for bulk string substitution
---

/var @tmpl = "Hello __NAME__, welcome to __PLACE__ on __DAY__"

# Bulk replacement with object
/show @tmpl.replaceAll({"__NAME__": "Alice", "__PLACE__": "Wonderland", "__DAY__": "Monday"})

# Single-entry object (degenerate case)
/var @str = "aaa-bbb-aaa"
/show @str.replaceAll({"aaa": "xxx"})

# Empty object (no-op)
/show @str.replaceAll({})

# Replacement values that contain other search keys
/var @swap = "AB"
/show @swap.replaceAll({"A": "B", "B": "A"})
