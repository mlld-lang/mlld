---
description: Exe directive with nested for expressions
---

>> Nested for expressions to create combinations
/exe @combine(a, b) = `@a-@b`
/exe @crossProduct(list1, list2) = for @x in @list1 => for @y in @list2 => @combine(@x, @y)

/var @colors = ["red", "blue"]
/var @sizes = ["small", "large"]
/var @combinations = @crossProduct(@colors, @sizes)
/show @combinations

>> Flattened nested iteration
/exe @tag(item, label) = `[@label] @item`
/exe @tagAll(items, labels) = for @item in @items => for @label in @labels => @tag(@item, @label)

/var @products = ["shirt", "pants"]
/var @tags = ["new", "sale"]
/var @taggedProducts = @tagAll(@products, @tags)
/show @taggedProducts