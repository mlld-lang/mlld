/var @items = "alpha, beta, gamma"
/for @item in @items.split(",") => show `Item: @item.trim().slice(0,2)`
