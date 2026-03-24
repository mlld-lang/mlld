/guard after @checkAfterTaint for secret = when [
  * => allow `ctx=@mx.taint.includes("src:js") out=@output.mx.taint.includes("src:js")`
]

/exe secret @emit() = js { return "value"; }

/show @emit()
