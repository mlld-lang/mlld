/exe @a() = "A"
/exe @b() = "B"
/exe @echoExec(value) = cmd {echo "exec:@value"}
/exe @staticExec = cmd {echo "STATIC"}
/exe @demo(payload) = [
  run @echoExec("EXEC")
  run @staticExec
  run cmd {echo "CMD"}
  run {echo "BRACES"}
  run js {console.log("JS")}
  run "echo QUOTED"
  run @payload | cmd {cat}
  run || @a() || @b()
  => "DONE"
]
/show @demo("STDIN")
