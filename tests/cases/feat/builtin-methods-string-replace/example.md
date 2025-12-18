---
description: Test .replace() and .replaceAll() builtin string methods
---

/var @str = "Hello OLD world OLD again"
/var @spaced = "a b c d"
/var @text = "test TEST test"
/var @messy = "  hello world  "
/var @empty = ""
/var @nomatch = "abc"
/var @multi = "a-b-c-d"

# Basic replace (first occurrence only)
/show @str.replace("OLD", "NEW")

# Replace all occurrences
/show @str.replaceAll("OLD", "NEW")

# Replace with empty string
/show @spaced.replaceAll(" ", "")

# Replace in variable
/show @text.replace("test", "PASS")

# Chain with other methods
/show @messy.trim().replace("world", "mlld")

# Edge cases - empty string
/show @empty.replace("x", "y")

# Edge cases - no match
/show @nomatch.replace("xyz", "123")

# Multiple replacements with replaceAll
/show @multi.replaceAll("-", "_")
