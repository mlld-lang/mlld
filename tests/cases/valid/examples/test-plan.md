/var @tests = run {npm test}

/var @res = run {llm "What's broken here? @tests"}

/run {llm "Make a plan to fix @res"}