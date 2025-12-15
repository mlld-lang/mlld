/exe @a() = "A"
/exe @b() = "B"
/exe @echoItem(item) = cmd {echo "exec:@item"}
/var @count = 0
/for @item in ["X"] [
  run @echoItem(@item)
  run cmd {echo "CMD:@item"}
  run js (@item) {console.log("js:" + item)}
  run "echo QUOTED"
  run @item | cmd {cat}
  run || @a() || @b()
  let @count += 1
]
/show "DONE:@count"
