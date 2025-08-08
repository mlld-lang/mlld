---
description: For loop with output
---

/var @items = ["apple", "banana", "cherry"]
/for @item in @items => /show `Fruit: @item`

/exe @echo(value) = {echo "Hello @value"}
/for @item in @items => @echo(@item)

/exe @template(var) = `
This is a template that contains @var
`
/for @item in @items => @template(@item)