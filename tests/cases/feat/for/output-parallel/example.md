---
description: Output works inside parallel for-expression blocks
---

# Output in parallel for-expression

/var @items = ["one", "two"]
/var @results = for parallel(2) @item in @items [
  let @data = { name: @item }
  output @data to "for-output-parallel-@item-data.json"
  => @item
]
/show `Wrote @results.length files`

/var @file1 = <for-output-parallel-one-data.json>
/var @file2 = <for-output-parallel-two-data.json>
/show `File 1: @file1.data.name`
/show `File 2: @file2.data.name`
