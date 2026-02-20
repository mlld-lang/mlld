/var @outJs = js { return "js-ok" }
/var @outSh = sh { printf "%s" "sh-ok" }
/var @outPy = py { print("py-ok", end='') }
/var @outCmd = cmd { printf "%s" "cmd-ok" }
/var @outNode = node { return "node-ok" }

/exe @passthrough(value) = js { return value }

/var @jsResult = @passthrough(@outJs)
/var @shResult = @passthrough(@outSh)
/var @pyResult = @passthrough(@outPy)
/var @cmdResult = @passthrough(@outCmd)
/var @nodeResult = @passthrough(@outNode)

/show @jsResult.mx.taint.includes("src:js")
/show @shResult.mx.taint.includes("src:sh")
/show @pyResult.mx.taint.includes("src:py")
/show @cmdResult.mx.taint.includes("src:cmd")
/show @nodeResult.mx.taint.includes("src:node")
