---
description: Directive-backed actions inside for expressions keep their values
---

# For loop directive actions

/var @items = ["alpha", "beta"]
/var @runs = for @item in @items => run {echo "prepared-@item"}
/var @shows = for @item in @items => show `Value: @item`

/show `Run results: @runs`
/show `Show results: @shows`
