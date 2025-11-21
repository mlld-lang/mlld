/var @items = [
  { "path": "one.md", "ok": true },
  { "path": "two.md", "ok": false }
]

/var @paths = for @item.path in @items => when [
  @item.ok => @item.path
  * => "missing"
]

/for @path in @paths => show `Path: @path`
