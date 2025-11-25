# Command Ref Arg Interpolation (Basic)

/exe @echo(s) = cmd {echo "@s"}
/exe @wrap(a) = @echo("Prev: @a SFX")

/show @wrap("X")
