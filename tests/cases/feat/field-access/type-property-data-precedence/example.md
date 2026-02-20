/var @items = [{"type": "a", "value": 1}, {"type": "b", "value": 2}]
/var @types = for @item in @items => @item.type
/show @types | @json
