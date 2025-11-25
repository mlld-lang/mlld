/exe @process(input) = cmd { cat }

/var @result = { seed: 1 } | @process()

/show @result
