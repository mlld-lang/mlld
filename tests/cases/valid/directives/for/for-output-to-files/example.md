---
description: For loop with output to files
---

/var @items = ["apple", "banana", "cherry"]
/for @item in @items => /output @item to "test-@item-file.txt"
/for @item in @items => /output @item to stdout