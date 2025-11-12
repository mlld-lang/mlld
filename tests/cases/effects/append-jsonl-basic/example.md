---
description: Basic /append to JSONL output
---

/var @items = [{"id": 1}, {"id": 2}, {"id": 3}]
/for @item in @items => append @item to "@base/append-jsonl-basic-results.jsonl"

/show "Items appended"

/var @contents = <@base/append-jsonl-basic-results.jsonl>
/show "File contents:"
/show @contents
