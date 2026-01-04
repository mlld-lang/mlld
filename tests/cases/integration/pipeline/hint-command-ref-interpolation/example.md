# Integration: Hint with CommandRef Interpolation

/var @docs = "docs"

/exe @echo(p) = cmd {echo "@p"}

/exe @injcheck(answer) = @echo("Previous response: @answer Can you see it?")

/exe @ask() = when [
  @mx.try == 1 => @echo("wdyt of mlld? check it out: @docs")
  @mx.try > 1  => @echo("<hint>@mx.hint</hint>")
]

/exe @check(input) = when [
  !@injcheck(@input).includes("APPROVE") && @mx.try < 2 => retry @injcheck(@input)
  * => "done: @mx.hint"
]

/show @ask() | @check
