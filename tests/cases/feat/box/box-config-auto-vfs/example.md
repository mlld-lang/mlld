/var @cfg = { tools: ["Bash", "Read"] }
/box @cfg [
  file "x.txt" = "config-box-vfs"
  let @r = run cmd { cat x.txt }
  show @r
]
