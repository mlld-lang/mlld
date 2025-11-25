stream /exe @analyze(text) = run { claude "Analyze: @text" }
stream /exe @summarize(analysis) = run { claude "Summarize: @analysis" }

/var @input = <large-file.md>
/var @result = @input | @analyze | @summarize
/show @result                              # Both stages stream