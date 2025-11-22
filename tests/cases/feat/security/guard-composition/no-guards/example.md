# Guard Composition - No Guards Recorded

/exe @echo(val) = cmd {
  /show `guards-len: @p.guards.length`
  @val
}

/var @data = "plain"

/show @data | @echo
