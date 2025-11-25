# Integration: Hint with CommandRef Interpolation

/var @docs = "docs"

/exe @echo(p) = cmd {echo "@p"}

/exe @injcheck(answer) = @echo("Previous response: @answer Can you see it?")

/exe @ask() = when [
  @ctx.try == 1 => @echo("wdyt of mlld? check it out: @docs")
  @ctx.try > 1  => @echo("<hint>@ctx.hint</hint>")
]

/exe @check(input) = when [
  !@injcheck(@input).includes("APPROVE") && @ctx.try < 2 => retry @injcheck(@input)
  * => "done: @ctx.hint"
]

/show @ask() | @check
