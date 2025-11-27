# Operation guard blocks specific /run subtype

/guard @blockNode before op:run = when [
  @ctx.op.subtype == "node" => deny "No node commands"
  * => allow
]

/run {echo "cmd ok"}
/run node {console.log("node blocked")}
