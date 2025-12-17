# Operation guard blocks specific /run subtype

/guard @blockNode before op:run = when [
  @mx.op.subtype == "node" => deny "No node commands"
  * => allow
]

/run {echo "cmd ok"}
/run node {console.log("node blocked")}
