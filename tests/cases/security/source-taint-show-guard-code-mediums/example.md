/guard @checkSourceTaint before op:show = when [
  @input.any.text.includes("js-ok") && !@input.any.mx.taint.includes("src:js") => deny "missing js"
  @input.any.text.includes("sh-ok") && !@input.any.mx.taint.includes("src:sh") => deny "missing sh"
  @input.any.text.includes("py-ok") && !@input.any.mx.taint.includes("src:py") => deny "missing py"
  @input.any.text.includes("cmd-ok") && !@input.any.mx.taint.includes("src:cmd") => deny "missing cmd"
  @input.any.text.includes("node-ok") && !@input.any.mx.taint.includes("src:node") => deny "missing node"
  * => allow
]

/var @outJs = js { return "js-ok" }
/var @outSh = sh { printf "%s" "sh-ok" }
/var @outPy = py { print("py-ok", end='') }
/var @outCmd = cmd { echo "cmd-ok" }
/var @outNode = node { return "node-ok" }

/show @outJs
/show @outSh
/show @outPy
/show @outCmd
/show @outNode
