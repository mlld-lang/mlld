>> Function-call arguments may themselves be expressions with operators.
/exe @deepEq(a, b) = js {return a === b}
/exe @assertOk(cond, msg) = `r: @cond @msg`
/var @results = [
  @assertOk(@deepEq(1, 1) && true, "and-true"),
  @assertOk(@deepEq(1, 1) && !@deepEq(1, 2), "and-not"),
  @assertOk(true, @deepEq(1, 1) && true),
  @assertOk(@deepEq(1, 1) ? "yes" : "no", "tern"),
  @assertOk(@deepEq(1, 1), "alone")
]
/show @results | @json
