/exe @a() = "A"
/exe @b() = "B"
/exe @echoItem(item) = cmd {echo "exec:@item"}
/exe @staticExec = cmd {echo "STATIC"}
/var @count = 0
/for @item in ["X"] [
  run @echoItem(@item)
  run @staticExec
  run cmd {echo "CMD:@item"}
  run {echo "BRACES"}
  run js (@item) {console.log("js:" + item)}
  run "echo QUOTED"
  run @item | cmd {cat}
  run @item | {cat}
  run || @a() || @b()
  let @count += 1
]
/show "DONE:@count"
