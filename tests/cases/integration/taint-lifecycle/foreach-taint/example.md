/var secret @tokens = ["alpha", "beta"]

/exe @echoValue(value) = run {
  printf "@value"
}

/var @results = foreach @echoValue(@tokens)

/show `Foreach taint: @results[0].ctx.taint`
/show `Foreach labels: @results[0].ctx.labels`
