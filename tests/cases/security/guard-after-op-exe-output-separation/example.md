/guard after @checkExe for op:exe = when [
  @mx.op.name == "transform" => allow `exe-ctx:in=@input[0] out=@output`
  * => allow
]

/guard after @checkCmd for op:cmd = when [
  @mx.op.name == "emitCmd" => allow `cmd-ctx:in=@input[0] out=@output`
  * => allow
]

/exe @transform(value) = js { return 'out:' + value; }
/exe @emitCmd(value) = cmd { printf "CMD:@value" }

/show @transform("seed")
/show @emitCmd("alpha")
