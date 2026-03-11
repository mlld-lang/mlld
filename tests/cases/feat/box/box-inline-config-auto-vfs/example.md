/box { tools: ["Bash", "Read"] } [
  file "x.txt" = "inline-config-vfs"
  let @r = run cmd { cat x.txt }
  show @r
]
